const fs = require('fs');
let code = fs.readFileSync('src/pages/Tuition.tsx', 'utf-8');

const target3 = `      } else {
        tableRows += \`
          <tr>
            <td style="text-align: center;">\${idx + 1}</td>
            <td>\${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\\@';">\${phoneStr}</td>
            <td style="text-align: center;">\${st.sessionsAttended}</td>
            <td style="text-align: center; color: #059669;">\${st.sessionsPreviouslyPaid > 0 ? st.sessionsPreviouslyPaid : '-'}</td>
            <td style="text-align: center; color: #92400e; font-weight: bold;">\${st.sessionsToPay}</td>
            <td style="text-align: center;">\${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">\${fmtCurrency(st.tuition)}</td>
            <td>\${st.note || ''}</td>
          </tr>
        \`;
      }
    });`;

const replacement3 = `      } else {
        tableRows += \`
          <tr>
            <td style="text-align: center;">\${idx + 1}</td>
            <td>\${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\\@';">\${phoneStr}</td>
            <td style="text-align: center;">\${st.sessionsAttended}</td>
            <td style="text-align: center; color: #059669;">\${st.sessionsPreviouslyPaid > 0 ? st.sessionsPreviouslyPaid : '-'}</td>
            <td style="text-align: center; color: #92400e; font-weight: bold;">\${st.sessionsToPay}</td>
            <td style="text-align: center;">\${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">\${fmtCurrency(st.tuition)}</td>
            <td>\${st.note || ''}</td>
          </tr>
        \`;
      }
    });

    const sumAttended = processedStudents.reduce((sum, s: any) => sum + (s.sessionsAttended || 0), 0);
    const sumPreviouslyPaid = processedStudents.reduce((sum, s: any) => sum + (s.sessionsPreviouslyPaid || 0), 0);
    const sumToPay = processedStudents.reduce((sum, s: any) => sum + (s.sessionsToPay || 0), 0);
    const sumTuition = processedStudents.reduce((sum, s: any) => sum + (s.tuition || 0), 0);

    if (tabMode === 'TREASURER') {
      tableRows += \`
        <tr style="background-color: #f2f2f2; font-weight: bold;">
          <td colspan="3" style="text-align: right; padding-right: 15px;">TỔNG CỘNG</td>
          <td style="text-align: center; color: #0369a1;">\${sumAttended}</td>
          <td style="text-align: center; color: #059669;">\${sumPreviouslyPaid > 0 ? sumPreviouslyPaid : '-'}</td>
          <td style="text-align: center; color: #92400e;">\${sumToPay}</td>
          <td></td>
          <td style="text-align: right;">\${fmtCurrency(sumTuition)}</td>
          <td></td>
          <td></td>
        </tr>
      \`;
    } else {
      tableRows += \`
        <tr style="background-color: #f2f2f2; font-weight: bold;">
          <td colspan="3" style="text-align: right; padding-right: 15px;">TỔNG CỘNG</td>
          <td style="text-align: center; color: #0369a1;">\${sumAttended}</td>
          <td style="text-align: center; color: #059669;">\${sumPreviouslyPaid > 0 ? sumPreviouslyPaid : '-'}</td>
          <td style="text-align: center; color: #92400e;">\${sumToPay}</td>
          <td></td>
          <td style="text-align: right;">\${fmtCurrency(sumTuition)}</td>
          <td></td>
        </tr>
      \`;
    }`;

if (code.includes(target3)) {
  code = code.replace(target3, replacement3);
  fs.writeFileSync('src/pages/Tuition.tsx', code);
  console.log("Replaced target3 successfully!");
} else {
  console.log("target3 not found!");
}
