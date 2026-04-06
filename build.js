const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load manifest
const manifestPath = path.join(__dirname, 'manifest.json');
const rawData = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(rawData);

function packExtension(browserType) {
    const buildDir = path.join(__dirname, `build-${browserType}`);
    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir);
    }

    // Prepare modified manifest
    const bm = JSON.parse(JSON.stringify(manifest));
    
    if (browserType === 'firefox') {
        // Deliberately use scripts for broad AMO compatibility/lint cleanliness in Firefox packaging
        bm.background = {
            "scripts": ["background.js"]
        };
    } else {
        // Chrome strictly forbids scripts in MV3
        bm.background = {
            "service_worker": "background.js"
        };
    }

    // Write all essential files to build folder
    const filesToCopy = [
        'background.js', 'content.js', 'overlay.css',
        'player.html', 'player.js', 'welcome.html', 'welcome.js', 'icons', 'libs'
    ];

    filesToCopy.forEach(file => {
        const src = path.join(__dirname, file);
        const dest = path.join(buildDir, file);
        if (fs.existsSync(src)) {
            if (fs.statSync(src).isDirectory()) {
                fs.cpSync(src, dest, { recursive: true });
            } else {
                fs.copyFileSync(src, dest);
            }
        }
    });

    // Write tailored manifest
    fs.writeFileSync(path.join(buildDir, 'manifest.json'), JSON.stringify(bm, null, 2));

    console.log(`✅ Packed extension for ${browserType.toUpperCase()} in /build-${browserType}`);
}

// U10: Auto-sync README version with manifest
const readmePath = path.join(__dirname, 'README.md');
if (fs.existsSync(readmePath)) {
    let readme = fs.readFileSync(readmePath, 'utf8');
    readme = readme.replace(/\*\*Version:\*\*\s*\S+/, `**Version:** ${manifest.version}`);
    fs.writeFileSync(readmePath, readme);
    console.log(`📝 README.md version synced to ${manifest.version}`);
}

// U11: Auto-sync welcome page version badges with manifest
const welcomePath = path.join(__dirname, 'welcome.html');
if (fs.existsSync(welcomePath)) {
    let welcome = fs.readFileSync(welcomePath, 'utf8');
    const badgePattern = /(<span class="version-badge">)v[0-9A-Za-z._-]+(<\/span>)/;
    const footerPattern = /(\bVersion\s+)[0-9A-Za-z._-]+(<\/p>)/;

    const badgeFound = badgePattern.test(welcome);
    welcome = welcome.replace(badgePattern, `$1v${manifest.version}$2`);

    const footerFound = footerPattern.test(welcome);
    welcome = welcome.replace(footerPattern, `$1${manifest.version}$2`);

    const missingMarkers = [];
    if (!badgeFound) missingMarkers.push('version-badge');
    if (!footerFound) missingMarkers.push('footer-version');

    if (badgeFound || footerFound) {
        fs.writeFileSync(welcomePath, welcome);
    }
    if (missingMarkers.length > 0) {
        console.warn(`⚠️ welcome.html version markers not found: ${missingMarkers.join(', ')}`);
    }
    console.log(`📝 welcome.html version synced to ${manifest.version}`);
}

['chrome', 'firefox'].forEach(packExtension);
console.log("\n📦 To create a ZIP, zip the CONTENTS of the build folders (not the folder itself).");
