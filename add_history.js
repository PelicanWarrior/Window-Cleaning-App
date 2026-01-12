const fs = require('fs');

const filePath = 'c:\\Users\\Gavin\\Window Cleaning App\\src\\components\\CustomerList.jsx';

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Replacement 1: Update the conditional to check both showServices and showHistory
content = content.replace(
  '{!showServices ? (',
  '{!showServices && !showHistory ? ('
);

// Replacement 2: Insert history view before services view
const servicesViewPattern = /(\s+)\) : \(\s+\/\/ Services View/;
const historyView = `$1) : showHistory ? (
$1  // History View
$1  <div className="history-list">
$1    {customerHistory.length > 0 ? (
$1      <table className="history-table">
$1        <thead>
$1          <tr>
$1            <th>Date</th>
$1            <th>Message</th>
$1          </tr>
$1        </thead>
$1        <tbody>
$1          {customerHistory.map((entry, index) => (
$1            <tr key={index}>
$1              <td>{formatDateByCountry(entry.created_at, user.SettingsCountry || 'United Kingdom')}</td>
$1              <td>{entry.Message}</td>
$1            </tr>
$1          ))}
$1        </tbody>
$1      </table>
$1    ) : (
$1      <p>No history found for this customer.</p>
$1    )}
$1  </div>
$1) : (
$1  // Services View`;

content = content.replace(servicesViewPattern, historyView);

// Write the file back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✓✓ History view added successfully!');
