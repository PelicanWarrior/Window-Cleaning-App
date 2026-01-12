import re

file_path = r"c:\Users\Gavin\Window Cleaning App\src\components\CustomerList.jsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# First replacement: Update the modal action buttons section
old_buttons = '''              ) : (
                <>
                  {!showServices && <button className="modal-edit-btn" onClick={() => { setIsEditingModal(true); setModalEditData({...selectedCustomer}); }}>Edit</button>}
                  <button className="modal-services-btn" onClick={() => { setShowServices(!showServices); if (!showServices) fetchCustomerServices(selectedCustomer.id); }}>{showServices ? 'Customer Details' : 'Services'}</button>
                </>
              )}'''

new_buttons = '''              ) : (
                <>
                  {!showServices && !showHistory && <button className="modal-edit-btn" onClick={() => { setIsEditingModal(true); setModalEditData({...selectedCustomer}); }}>Edit</button>}
                  <button className="modal-services-btn" onClick={() => { setShowServices(!showServices); setShowHistory(false); if (!showServices) fetchCustomerServices(selectedCustomer.id); }}>{showServices ? 'Customer Details' : 'Services'}</button>
                  <button className="modal-history-btn" onClick={() => { setShowHistory(!showHistory); setShowServices(false); if (!showHistory) fetchCustomerHistory(selectedCustomer.id); }}>{showHistory ? 'Customer Details' : 'History'}</button>
                </>
              )}'''

content = content.replace(old_buttons, new_buttons)

# Second replacement: Update the conditional render structure
old_structure = '''            {!showServices ? (
              // Customer Details View'''

new_structure = '''            {!showServices && !showHistory ? (
              // Customer Details View'''

content = content.replace(old_structure, new_structure)

# Third replacement: Add history view before services view
old_services = '''            ) : (
              // Services View
              <div className="services-list">'''

new_services = '''            ) : showHistory ? (
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

content = content.replace(old_services, new_services)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("File updated successfully!")
