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
        // Firefox requires BOTH service_worker AND scripts in MV3 OR just scripts
        bm.background = {
            "service_worker": "background.js",
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
        'player.html', 'player.js', 'welcome.html', 'icons', 'libs'
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

['chrome', 'firefox'].forEach(packExtension);
console.log("\n📦 To create a ZIP, zip the CONTENTS of the build folders (not the folder itself).");
