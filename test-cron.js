require('dotenv').config();
const db = require('./config/db');
const { sendEmail, emailOverdue, emailNearDue } = require('./config/mail');

async function test() {
  console.log("🧪 ทดสอบส่งเมล...");

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
  `);

  console.log(`พบรายการเกินกำหนด: ${overdueList.length} รายการ`);
  console.table(overdueList.map(r => ({ 
    code: r.BorrowCode, 
    email: r.email, 
    days: r.overdueDays 
  })));

  for (const r of overdueList) {
    const result = await sendEmail({
      to: r.email,
      subject: `🚨 ทดสอบ - อุปกรณ์เกินกำหนดคืน ${r.overdueDays} วัน - ${r.BorrowCode}`,
      html: emailOverdue({
        borrowCode: r.BorrowCode,
        name: `${r.fname} ${r.lname}`,
        deviceName: r.deviceName,
        assetTag: r.assetTag,
        dueDate: r.DueDate,
        overdueDays: r.overdueDays
      })
    });
    console.log(`📧 ${r.email} → ${result.success ? '✅ สำเร็จ' : '❌ ล้มเหลว'}`);
    if (result.previewUrl) {
      console.log(`   Preview: ${result.previewUrl}`);
    }
  }

  // ---- ใกล้ครบกำหนด ----
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
  `);

  console.log(`\nพบรายการใกล้ครบกำหนด: ${nearDueList.length} รายการ`);
  console.table(nearDueList.map(r => ({ 
    code: r.BorrowCode, 
    email: r.email, 
    remain: r.remainDays 
  })));

  for (const r of nearDueList) {
    const result = await sendEmail({
      to: r.email,
      subject: `⏰ ทดสอบ - อุปกรณ์ใกล้ครบกำหนดคืน ${r.remainDays} วัน - ${r.BorrowCode}`,
      html: emailNearDue({
        borrowCode: r.BorrowCode,
        name: `${r.fname} ${r.lname}`,
        deviceName: r.deviceName,
        assetTag: r.assetTag,
        dueDate: r.DueDate,
        remainDays: r.remainDays
      })
    });
    console.log(`📧 ${r.email} → ${result.success ? '✅ สำเร็จ' : '❌ ล้มเหลว'}`);
    if (result.previewUrl) {
      console.log(`   Preview: ${result.previewUrl}`);
    }
  }

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});