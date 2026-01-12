import re

file_path = r"c:\Users\Gavin\Window Cleaning App\src\components\CustomerList.jsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the conditional structure to check both showServices and showHistory
old_conditional = '''            {!showServices ? (
              // Customer Details View'''

new_conditional = '''            {!showServices && !showHistory ? (
              // Customer Details View'''

content = content.replace(old_conditional, new_conditional)

# Add history view before services view
old_services_start = '''            ) : (
              // Services View
              <div className="services-list">'''

new_with_history = '''            ) : showHistory ? (
              // History View
              <div className="history-list">
                {customerHistory.length > 0 ? (
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerHistory.map((entry, index) => (
                        <tr key={index}>
                          <td>{formatDateByCountry(entry.created_at, user.SettingsCountry || 'United Kingdom')}</td>
                          <td>{entry.Message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No history found for this customer.</p>
                )}
              </div>
            ) : (
              // Services View
              <div className="services-list">'''

content = content.replace(old_services_start, new_with_history)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ History view added successfully!")
