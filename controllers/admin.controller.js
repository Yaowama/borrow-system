exports.deviceListAdd = (req, res) => {
  const modelId = req.params.modelId;

  const sql = `
    SELECT d.*,
           e.username AS CreatedByName
    FROM TB_T_Deviceadd d
    LEFT JOIN tb_t_employee e
           ON d.CreatedBy = e.EMPID
    WHERE d.ModelID = ?
    ORDER BY d.CreatedDate DESC
  `;

  db.query(sql, [modelId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send("Database error");
    }

    res.render("admin/device-listadd", {
      devices: results,
      modelId
    });
  });
};
