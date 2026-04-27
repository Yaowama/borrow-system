const cron = require("node-cron");
const db = require("./db");
const { sendEmail, emailOverdue, emailNearDue } = require("./mail");

// รันทุกวัน เวลา 08:00 น.
cron.schedule("0 8 * * *", async () => {
  console.log("⏰ Cron: ส่งเมลแจ้งเตือนการยืม...");

  try {
    // ---- เกินกำหนด ----
    const [overdueList] = await db.query(`
      SELECT
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
      WHERE bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND bt.DueDate < DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))
        AND e.email IS NOT NULL
    `);

    for (const r of overdueList) {
      await sendEmail({
        to: r.email,
        subject: `🚨 อุปกรณ์เกินกำหนดคืน ${r.overdueDays} วัน - ${r.BorrowCode}`,
        html: emailOverdue({
          borrowCode: r.BorrowCode,
          name: `${r.fname} ${r.lname}`,
          deviceName: r.deviceName,
          assetTag: r.assetTag,
          dueDate: r.DueDate,
          overdueDays: r.overdueDays
        })
      });
      console.log(`📧 ส่งเมลเกินกำหนด → ${r.email}`);
    }

    // ---- ใกล้ครบกำหนด (0-3 วัน) ----
    const [nearDueList] = await db.query(`
      SELECT
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
      WHERE bt.BorrowStatusID = 6
        AND bt.ReturnDate IS NULL
        AND DATEDIFF(bt.DueDate, DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00'))) BETWEEN 0 AND 3
        AND e.email IS NOT NULL
    `);

    for (const r of nearDueList) {
      await sendEmail({
        to: r.email,
        subject: `⏰ อุปกรณ์ใกล้ครบกำหนดคืน ${r.remainDays} วัน - ${r.BorrowCode}`,
        html: emailNearDue({
          borrowCode: r.BorrowCode,
          name: `${r.fname} ${r.lname}`,
          deviceName: r.deviceName,
          assetTag: r.assetTag,
          dueDate: r.DueDate,
          remainDays: r.remainDays
        })
      });
      console.log(`📧 ส่งเมลใกล้ครบ → ${r.email}`);
    }

  } catch (err) {
    console.error("CRON ERROR:", err);
  }
}, {
  timezone: "Asia/Bangkok"
});