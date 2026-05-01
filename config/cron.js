const cron = require("node-cron");
const db = require("./db");
const { sendEmail, emailOverdue, emailNearDue } = require("./mail");

// ทดสอบ: รันทุก 1 นาที → พอใช้งานจริงเปลี่ยนเป็น "0 8 * * *"
cron.schedule("* * * * *", async () => {
  console.log("⏰ Cron: ส่งเมลแจ้งเตือนการยืม...");

  try {
    // ---- เกินกำหนด ----
    const [overdueList] = await db.query(`
      SELECT
        bt.BorrowID,
        bt.BorrowCode,
        DATEDIFF(DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00')), bt.DueDate) AS overdueDays,
        DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,
        e.fname, e.lname, e.email,
        COALESCE(d.DeviceName, t.TypeName, '-') AS deviceName,
        COALESCE(da.AssetTag, '-') AS assetTag
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
      WHERE bt.BorrowStatusID IN (2, 6)
        AND bt.ReturnDate IS NULL
        AND bt.DueDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
        AND e.email IS NOT NULL
        AND (
          bt.LastOverdueNotiDate IS NULL 
          OR bt.LastOverdueNotiDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
        )
    `);

    console.log(`พบเกินกำหนด: ${overdueList.length} รายการ`);

    for (const r of overdueList) {
      const result = await sendEmail({
        to: r.email,
        subject: `อุปกรณ์เกินกำหนดคืน ${r.overdueDays} วัน - ${r.BorrowCode}`,
        html: emailOverdue({
          borrowCode: r.BorrowCode,
          name: `${r.fname} ${r.lname}`,
          deviceName: r.deviceName,
          assetTag: r.assetTag,
          dueDate: r.DueDate,
          overdueDays: r.overdueDays
        })
      });

      if (result.success) {
        await db.query(`
          UPDATE tb_t_borrowtransaction
          SET LastOverdueNotiDate = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
          WHERE BorrowID = ?
        `, [r.BorrowID]);
        console.log(`📧 ส่งเมลเกินกำหนด → ${r.email} (${r.BorrowCode})`);
      } else {
        console.error(`❌ ส่งไม่ได้ → ${r.email}:`, result.error);
      }
    }

    // ---- ใกล้ครบกำหนด (0-3 วัน) ----
    const [nearDueList] = await db.query(`
      SELECT
        bt.BorrowID,
        bt.BorrowCode,
        DATEDIFF(bt.DueDate, DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))) AS remainDays,
        DATE_FORMAT(bt.DueDate, '%d/%m/%Y') AS DueDate,
        e.fname, e.lname, e.email,
        COALESCE(d.DeviceName, t.TypeName, '-') AS deviceName,
        COALESCE(da.AssetTag, '-') AS assetTag
      FROM tb_t_borrowtransaction bt
      JOIN tb_t_employee e ON bt.EMPID = e.EMPID
      LEFT JOIN tb_t_deviceadd da ON bt.DVID = da.DVID
      LEFT JOIN tb_t_device d ON da.DeviceID = d.DeviceID
      LEFT JOIN tb_m_type t ON bt.TypeID = t.TypeID
      WHERE bt.BorrowStatusID IN (2, 6)
        AND bt.ReturnDate IS NULL
        AND DATEDIFF(bt.DueDate, DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))) BETWEEN 0 AND 3
        AND e.email IS NOT NULL
        AND (
          bt.LastNearDueNotiDate IS NULL 
          OR bt.LastNearDueNotiDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
        )
    `);

    console.log(`พบใกล้ครบกำหนด: ${nearDueList.length} รายการ`);

    for (const r of nearDueList) {
      const result = await sendEmail({
        to: r.email,
        subject: `อุปกรณ์ใกล้ครบกำหนดคืน ${r.remainDays} วัน - ${r.BorrowCode}`,
        html: emailNearDue({
          borrowCode: r.BorrowCode,
          name: `${r.fname} ${r.lname}`,
          deviceName: r.deviceName,
          assetTag: r.assetTag,
          dueDate: r.DueDate,
          remainDays: r.remainDays
        })
      });

      if (result.success) {
        await db.query(`
          UPDATE tb_t_borrowtransaction
          SET LastNearDueNotiDate = DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
          WHERE BorrowID = ?
        `, [r.BorrowID]);
        console.log(`📧 ส่งเมลใกล้ครบ → ${r.email} (${r.BorrowCode})`);
      } else {
        console.error(`❌ ส่งไม่ได้ → ${r.email}:`, result.error);
      }
    }

  } catch (err) {
    console.error("CRON ERROR:", err);
  }
}, {
  timezone: "Asia/Bangkok"
});