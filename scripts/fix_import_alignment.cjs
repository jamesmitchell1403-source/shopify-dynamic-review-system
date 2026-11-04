const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'app', 'routes', 'app.import-reviews.tsx');
let content = fs.readFileSync(targetPath, 'utf-8');

// 1. Update .upload-cloud-icon CSS
const oldCss = `        .upload-cloud-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #eff6ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          color: #2563eb;
          transition: transform 0.2s ease;
        }`;

const newCss = `        .upload-cloud-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #eff6ff;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
          color: #2563eb;
          transition: transform 0.2s ease;
        }`;

// 2. Update JSX container on line 1115
const oldJsx = `              ) : (
                <div>
                  <div className="upload-cloud-icon">`;

const newJsx = `              ) : (
                <div style={{ maxWidth: "480px", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div className="upload-cloud-icon">`;

let normalizedContent = content.replace(/\r\n/g, '\n');

if (normalizedContent.includes(oldCss.replace(/\r\n/g, '\n'))) {
  normalizedContent = normalizedContent.replace(oldCss.replace(/\r\n/g, '\n'), newCss.replace(/\r\n/g, '\n'));
  console.log('Updated .upload-cloud-icon CSS.');
} else {
  console.error('Could not find oldCss in app.import-reviews.tsx!');
}

if (normalizedContent.includes(oldJsx.replace(/\r\n/g, '\n'))) {
  normalizedContent = normalizedContent.replace(oldJsx.replace(/\r\n/g, '\n'), newJsx.replace(/\r\n/g, '\n'));
  console.log('Updated JSX container.');
} else {
  console.error('Could not find oldJsx in app.import-reviews.tsx!');
}

fs.writeFileSync(targetPath, normalizedContent, 'utf-8');
console.log('Successfully updated app.import-reviews.tsx!');

