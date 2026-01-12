import sys

file_path = r"c:\Users\Gavin\Window Cleaning App\src\components\CustomerList.jsx"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Step 1: Update line 1261 from {!showServices ? ( to {!showServices && !showHistory ? (
if lines[1260].strip() == "{!showServices ? (":
    lines[1260] = "            {!showServices && !showHistory ? (\n"
    print("✓ Updated line 1261 to check both showServices and showHistory")
else:
    print(f"⚠ Line 1261 doesn't match expected pattern. Found: {lines[1260].strip()}")

# Step 2: Find ") : (" followed by "// Services View" and insert history view
found = False
for i in range(len(lines) - 1):
    if ") : (" in lines[i] and i+1 < len(lines) and "// Services View" in lines[i+1]:
        # Replace this line and the next with the history view section
        indent = "            "
        history_section = f'''{indent}) : showHistory ? (
{indent}  // History View
{indent}  <div className="history-list">
{indent}    {{customerHistory.length > 0 ? (
{indent}      <table className="history-table">
{indent}        <thead>
{indent}          <tr>
{indent}            <th>Date</th>
{indent}            <th>Message</th>
{indent}          </tr>
{indent}        </thead>
{indent}        <tbody>
{indent}          {{customerHistory.map((entry, index) => (
{indent}            <tr key={{index}}>
{indent}              <td>{{formatDateByCountry(entry.created_at, user.SettingsCountry || 'United Kingdom')}}</td>
{indent}              <td>{{entry.Message}}</td>
{indent}            </tr>
{indent}          ))}}
{indent}        </tbody>
{indent}      </table>
{indent}    ) : (
{indent}      <p>No history found for this customer.</p>
{indent}    )}}
{indent}  </div>
{indent}) : (
{indent}  // Services View
'''
        lines[i] = history_section
        del lines[i+1]  # Remove the old "// Services View" line
        print(f"✓ Inserted history view at line {i+1}")
        found = True
        break

if not found:
    print("⚠ Could not find the location to insert history view")

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("✓ File updated successfully!")
