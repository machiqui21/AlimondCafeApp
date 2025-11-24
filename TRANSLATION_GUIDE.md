# Translation Implementation Guide - Alimond Café

## Overview
Your website now has **two translation systems** working together:

### 1. **Manual Translations** (i18n) - Best for Accuracy
- Located in `/locales/en.json` and `/locales/tl.json`
- Used for important text with `<%= __('text') %>` in EJS templates
- **Advantage**: Precise, controlled translations
- **Best for**: Key messages, menus, instructions

### 2. **Google Translate Widget** - Automatic for Everything Else  
- Automatically translates all text on the page
- Users can select language from the widget
- **Advantage**: No manual work needed
- **Best for**: Product descriptions, dynamic content

---

## How It Works

### Language Selector Bar
Users will see a prominent language bar at the top of each page with:
- 🇬🇧 English / 🇵🇭 Tagalog buttons (your manual translations)
- Google Translate dropdown widget (automatic translation)

### Dual Translation Approach:
1. **Click "English" or "Tagalog" buttons**: Uses your manual translations from JSON files
2. **Use Google Translate widget**: Automatically translates the entire page

---

## Adding New Manual Translations

### When to Add Manual Translations:
- Important UI elements (buttons, labels, headings)
- Menu items and product categories
- Error messages and notifications
- Key marketing messages

### How to Add:

1. **In your EJS template**, wrap text with translation function:
   ```html
   <%= __('Your text here') %>
   ```

2. **Add to `/locales/en.json`**:
   ```json
   {
     "Your text here": "Your text here"
   }
   ```

3. **Add Tagalog translation to `/locales/tl.json`**:
   ```json
   {
     "Your text here": "Iyong teksto dito"
   }
   ```

---

## Google Translate - No Extra Work!

The Google Translate widget will automatically translate:
- ✅ All product names
- ✅ All descriptions
- ✅ Dynamic content from database
- ✅ Any text you haven't manually translated
- ✅ New content you add in the future

**No need to update JSON files** for every small text change!

---

## Current Implementation

### Pages with Translation Support:
- ✅ Homepage
- ✅ Menu page
- ✅ Submenu pages (by product type)
- ✅ Login page
- ✅ Register page
- ✅ Registration Success page

### Language Selector Features:
- 🎨 Beautiful gradient background (#8b5a3c to #d4a373)
- 🌐 Prominent "Language / Wika" label
- 🇬🇧🇵🇭 Flag emojis for visual recognition
- ✨ Hover effects for better UX
- 📱 Responsive design (works on mobile)
- 🌙 Dark mode compatible

---

## For Users Who Don't Speak English

### How They Can Use the Site:

1. **Option 1: Click "Tagalog" button**
   - Uses your carefully crafted manual translations
   - Most accurate for key content

2. **Option 2: Use Google Translate dropdown**
   - Select "Tagalog" from the widget
   - Entire page translates automatically
   - Works for all content, including database items

3. **Best Experience: Use Both!**
   - Manual translations for navigation/UI
   - Google Translate fills in the rest

---

## Customization Tips

### To Change Language Selector Position:
Edit the `<div style="...">` in your EJS files. Current position: top of page.

### To Add More Languages:
1. Update Google Translate configuration:
   ```javascript
   includedLanguages: 'en,tl,es,zh-CN'  // Add language codes
   ```

2. For manual translations, create new JSON files:
   - `/locales/es.json` (Spanish)
   - `/locales/zh-CN.json` (Chinese)

### To Hide Google Translate Widget:
Remove or comment out:
```html
<div id="google_translate_element"></div>
```

---

## Technical Details

### Files Modified:
- ✅ `views/homepage.ejs`
- ✅ `views/menu.ejs`
- ✅ `views/submenu.ejs`
- ✅ `views/login.ejs`
- ✅ `views/register.ejs`
- ✅ `views/registerSuccess.ejs`
- ✅ `styles/styles.css` (Google Translate styling)

### Google Translate Configuration:
```javascript
new google.translate.TranslateElement({
  pageLanguage: 'en',           // Original language
  includedLanguages: 'en,tl',   // Available languages
  layout: google.translate.TranslateElement.InlineLayout.SIMPLE
}, 'google_translate_element');
```

### Supported Languages:
- `en` - English
- `tl` - Tagalog/Filipino

---

## Troubleshooting

### Google Translate Not Showing:
- Check internet connection (widget loads from Google servers)
- Ensure JavaScript is enabled
- Check browser console for errors

### Manual Translations Not Working:
- Verify text is wrapped in `<%= __('...') %>`
- Check JSON syntax in locale files
- Restart server after changing JSON files

### Text Not Translating:
- Some elements (images with text) cannot be auto-translated
- Dynamic content may need page reload after language change

---

## Best Practices

### DO:
✅ Use manual translations for important UI elements
✅ Keep JSON files organized and properly formatted
✅ Test both translation methods
✅ Provide context in translation keys

### DON'T:
❌ Translate everything manually (let Google Translate help!)
❌ Forget to add new keys to both en.json and tl.json
❌ Use complex HTML in translation strings
❌ Hard-code text in templates (always use translation function)

---

## Benefits Summary

### For You (Developer):
- 🚀 **Less tedious work** - Google Translate handles most content
- 🎯 **Focus on important translations** - Only translate key UI elements manually
- ⚡ **Faster development** - New content auto-translates
- 🔄 **Easy maintenance** - Update once, translate automatically

### For Your Users:
- 🌐 **Accessible to everyone** - English and Tagalog speakers
- 🎨 **Professional appearance** - Polished language selector
- 📱 **Easy to use** - One click to switch languages
- ✨ **Complete translation** - Entire site available in their language

---

## Example Workflow

### Adding a New Product:
1. Add product to database (in English)
2. **No translation needed!** Google Translate will handle it
3. Users click Tagalog → Entire product auto-translates

### Adding a New Page Feature:
1. Write template in English with `<%= __('Button text') %>`
2. Add "Button text": "Button text" to `en.json`
3. Add "Button text": "Teksto ng button" to `tl.json`
4. Everything else auto-translates via Google

---

## Support

For more information on:
- **i18n module**: https://github.com/mashpie/i18n-node
- **Google Translate Widget**: https://cloud.google.com/translate

---

**Last Updated**: November 21, 2025
**Version**: 1.0
