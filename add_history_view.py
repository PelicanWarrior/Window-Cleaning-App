file_path = r"c:\Users\Gavin\Window Cleaning App\src\components\CustomerList.jsx"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 1261: Change {!showServices ? ( to {!showServices && !showHistory ? (
lines[1260] = lines[1260].replace('{!showServices ? (', '{!showServices && !showHistory ? (')
print('✓ Updated line 1261')

# Find and update the conditional around line 1291
for i in range(1285, 1295):
    if ') : (' in lines[i] and i+1 < len(lines) and 'Services View' in lines[i+1]:
        # Build the history view section
        new_lines = [
            '            ) : showHistory ? (\n',
            '              // History View\n',
            '              <div className="history-list">\n',
            '                {customerHistory.length > 0 ? (\n',
            '                  <table className="history-table">\n',
            '                    <thead>\n',
            '                      <tr>\n',
            '                        <th>Date</th>\n',
            '                        <th>Message</th>\n',
            '                      </tr>\n',
            '                    </thead>\n',
            '                    <tbody>\n',
            '                      {customerHistory.map((entry, index) => (\n',
            '                        <tr key={index}>\n',
            '                          <td>{formatDateByCountry(entry.created_at, user.SettingsCountry || \'United Kingdom\')}</td>\n',
            '                          <td>{entry.Message}</td>\n',
            '                        </tr>\n',
            '                      ))}\n',
            '                    </tbody>\n',
            '                  </table>\n',
            '                ) : (\n',
            '                  <p>No history found for this customer.</p>\n',
            '                )}\n',
            '              </div>\n',
            '            ) : (\n',
            '              // Services View\n'
        ]
        lines[i:i+2] = new_lines
        print(f'✓ Inserted history view at line {i+1}')
        break

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('✓✓ File updated successfully!')
