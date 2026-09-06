const fs = require('fs');
let code = fs.readFileSync('src/pages/Tuition.tsx', 'utf-8');

const target1 = `      if (tabMode === 'TREASURER') {
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

const replacement1 = `      if (tabMode === 'TREASURER') {
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
            <td style="text-align: center; color: #059669;">\${st.sessionsPreviouslyPaid > 0 ? st.sessionsPreviouslyPaid : '-'}</td>
            <td style="text-align: center; color: #92400e; font-weight: bold;">\${st.sessionsToPay}</td>
            <td style="text-align: center;">\${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">\${fmtCurrency(st.tuition)}</td>
            <td>\${st.note || ''}</td>
          </tr>
        \`;
      }`;


if (code.includes(target1)) {
  code = code.replace(target1, replacement1);
  fs.writeFileSync('src/pages/Tuition.tsx', code);
  console.log("Replaced target1 successfully!");
} else {
  console.log("target1 not found! Length: ", target1.length);
}

