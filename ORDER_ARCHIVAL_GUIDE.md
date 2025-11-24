# Order Archival System - Setup & Usage Guide

## 1. Database Setup

First, run the migration to create the archive tables:

```bash
# In phpMyAdmin or MySQL command line, run:
mysql -u root -p alimondcafe < migrations/create-archive-tables.sql
```

Or manually execute the SQL in phpMyAdmin by opening the file `migrations/create-archive-tables.sql` and running it.

## 2. How the Archival System Works

### Three-Tier Data Management

1. **Active Orders** (orders table)
   - Recent orders visible in "All Orders" and "Order History"
   - Used for day-to-day operations

2. **Archived Orders** (orders_archive table)
   - Older completed/cancelled orders
   - Improves database performance
   - Preserves data for compliance and history

3. **Permanent Deletion**
   - After 7+ years (configurable)
   - Should only be done after legal/tax consultation

## 3. Accessing the Archival System

### Admin Navigation
1. Log in as admin
2. Click **"⚙️ Settings"** in the top navigation
3. You'll see the Order Management Settings page

### Available Options

#### A. Archive Old Orders
- **Purpose**: Move completed/cancelled orders to archive
- **Options**: 3, 6, 12, 18, 24, or 36 months
- **Recommendation**: Run every 6-12 months
- **What it does**:
  - Copies orders to archive tables
  - Deletes from main tables
  - Preserves all data (orders, items, options)

#### B. View Archived Orders
- Access historical data
- Filter by status (Completed/Cancelled)
- Sort by archive date or order ID
- Read-only view

#### C. Permanent Deletion
- **Minimum**: 7 years old
- **Warning**: Cannot be undone!
- **Recommendation**: Consult accountant/lawyer first
- **Use case**: GDPR compliance or storage management

## 4. Recommended Workflow

### Monthly/Quarterly:
- Review order statistics in Settings
- Check oldest order age

### Every 6-12 Months:
1. Go to Settings
2. Choose archive period (e.g., 12 months)
3. Click "Archive Old Orders"
4. Verify archived count
5. Check "View Archived Orders" to confirm

### Annually (Optional):
- Review archived orders
- If needed, permanently delete 7+ year old archives

## 5. Database Statistics

The Settings page shows:
- **Total Orders**: All orders in main database
- **Completed Orders**: Eligible for archiving
- **Archived Orders**: Currently in archive
- **Oldest Order**: Days since first order

## 6. Benefits

✅ **Performance**: Faster queries on smaller main tables
✅ **Organization**: Separate active vs historical data
✅ **Compliance**: Keep records for legal requirements
✅ **Backup**: Archive acts as additional data protection
✅ **Scalability**: Manage growing data over years

## 7. Safety Features

- ✅ Confirmation checkboxes required
- ✅ Double confirmation dialogs
- ✅ Transaction-based (all or nothing)
- ✅ Archive before delete (data preserved)
- ✅ Statistics before action

## 8. Troubleshooting

### "No orders found to archive"
- All recent orders are within the selected period
- Try selecting a shorter period

### Error during archival
- Check database connection
- Ensure archive tables exist
- Check database user permissions

### Can't see archived orders
- Verify archive tables were created
- Check that archival process completed successfully
- Try different filter/sort options

## 9. Legal Considerations

**Important**: Many jurisdictions require keeping transaction records for:
- 🇵🇭 Philippines: 10 years (BIR requirement)
- 🇺🇸 USA: 7 years (IRS requirement)
- 🇪🇺 EU: Varies by country (typically 7-10 years)

**Recommendation**: 
- Archive after 1 year
- Keep in archive for 7-10 years
- Consult with your accountant before permanent deletion

## 10. Backup Recommendations

Before archiving or deleting:
1. Backup your database
2. Export archived data to CSV/Excel periodically
3. Store backups securely off-site

---

## Quick Start

1. ✅ Run migration: `create-archive-tables.sql`
2. ✅ Navigate to: Admin → Settings
3. ✅ Review statistics
4. ✅ Archive orders older than 12 months
5. ✅ Verify in "View Archived Orders"

That's it! Your order archival system is now active.
