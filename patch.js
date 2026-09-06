const fs = require('fs');
let code = fs.readFileSync('src/pages/Tuition.tsx', 'utf-8');

const target = `      if (tabMode === 'TREASURER') {
        tableRows += \`
          <tr>
            <td style="text-align: center;">\${idx + 1}</td>
            <td>\${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\\@';">\${phoneStr}</td>
            <td style="text-align: center;">\${st.sessionsAttended}</td>
            <td style="text-align: center;">\${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">\${fmtCurrency(st.tuition)}</td>
            <td style="text-align: center; color: \${isPaid ? '#059669' : '#dc2626'}; font-weight: bold;">\${isPaid ? 'Đã thu' : 'Chưa thu'}</td>
            <td>\${st.note || ''}</td>
          </tr>
        \`;
      } else {
        tableRows += \`
          <tr>
            <td style="text-align: center;">\${idx + 1}</td>
            <td>\${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\\@';">\${phoneStr}</td>
            <td style="text-align: center;">\${st.sessionsAttended}</td>
            <td style="text-align: center;">\${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">\${fmtCurrency(st.tuition)}</td>
            <td>\${st.note || ''}</td>
          </tr>
        \`;
      }`;

const replacement = `      if (tabMode === 'TREASURER') {
        tableRows += \`
          <tr>
            <td style="text-align: center;">\${idx + 1}</td>
            <td>\${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\\@';">\${phoneStr}</td>
            <td style="text-align: center;">\${st.sessionsAttended}</td>
            <td style="text-align: center; color: #059669; font-weight: bold;">\${st.sessionsPreviouslyPaid > 0 ? st.sessionsPreviouslyPaid : '-'}</td>
            <td style="text-align: center; color: #92400e; font-weight: bold;">\${st.sessionsToPay}</td>
            <td style="text-align: center;">\${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">\${fmtCurrency(st.tuition)}</td>
            <td style="text-align: center; color: \${isPaid ? '#059669' : '#dc2626'}; font-weight: bold;">\${isPaid ? 'Đã thu' : 'Chưa thu'}</td>
            <td>\${st.note || ''}</td>
          </tr>
        \`;
      } else {
        tableRows += \`
          <tr>
            <td style="text-align: center;">\${idx + 1}</td>
            <td>\${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\\@';">\${phoneStr}</td>
            <td style="text-align: center;">\${st.sessionsAttended}</td>
            <td style="text-align: center; color: #059669; font-weight: bold;">\${st.sessionsPreviouslyPaid > 0 ? st.sessionsPreviouslyPaid : '-'}</td>
            <td style="text-align: center; color: #92400e; font-weight: bold;">\${st.sessionsToPay}</td>
            <td style="text-align: center;">\${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">\${fmtCurrency(st.tuition)}</td>
            <td>\${st.note || ''}</td>
          </tr>
        \`;
      }`;

if (code.includes(target)) {
  fs.writeFileSync('src/pages/Tuition.tsx', code.replace(target, replacement));
  console.log("Replaced successfully!");
} else {
  console.log("Target not found!");
}
