const { Student } = require('../models');

/**
 * Generate next admission number.
 * Format: CAMS/YYYY/NNNN  e.g. CAMS/2025/0001
 * NNNN is a zero-padded sequence that resets each year.
 */
async function generateAdmissionNumber() {
  const year = new Date().getFullYear();
  const prefix = `CAMS/${year}/`;

  // Find the highest sequence number for this year
  const last = await Student.findOne({
    where: {
      AdmissionNumber: {
        [require('sequelize').Op.like]: `${prefix}%`
      }
    },
    order: [['AdmissionNumber', 'DESC']],
    attributes: ['AdmissionNumber']
  });

  let nextSeq = 1;
  if (last && last.AdmissionNumber) {
    const parts = last.AdmissionNumber.split('/');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

module.exports = { generateAdmissionNumber };
