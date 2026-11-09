import fs from 'node:fs';

const plistPath = 'ios/App/App/Info.plist';
let plist = fs.readFileSync(plistPath, 'utf8');

const additions = `
	<key>UIBackgroundModes</key>
	<array>
		<string>audio</string>
	</array>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
	<key>FacebookAppID</key>
	<string>2174388996483129</string>
	<key>FacebookClientToken</key>
	<string>2ec34abc6b255345ebd3f937cd630ff7</string>
	<key>FacebookDisplayName</key>
	<string>Tu Tập</string>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>vn.quangtu.tutam</string>
				<string>fb2174388996483129</string>
			</array>
		</dict>
	</array>
</dict>
</plist>`;

if (!plist.includes('UIBackgroundModes')) {
  plist = plist.replace('</dict>\n</plist>', additions).replace('</dict>\r\n</plist>', additions);
  fs.writeFileSync(plistPath, plist, 'utf8');
  console.log('✓ Info.plist updated successfully with background audio and URL schemes');
} else {
  console.log('Info.plist already has UIBackgroundModes');
}
