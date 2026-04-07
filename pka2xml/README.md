# PKT2XML - Cisco Packet Tracer File Converter

Ever wanted to edit your Packet Tracer network configurations programmatically? This tool lets you convert Packet Tracer files (`.pkt` and `.pka`) to XML and back, so you can script configurations, automate network setups, or just peek inside to see what's going on.

## What Does This Do?

Cisco Packet Tracer stores network simulations in encrypted, compressed binary files. This tool:
- **Decrypts** and converts `.pkt`/`.pka` files into readable XML
- **Encrypts** and converts XML back into `.pkt`/`.pka` files
- Lets you **edit device configurations** by modifying XML directly
- Works **without opening Packet Tracer** - perfect for automation!

## Quick Start

### Convert PKT to XML
```bash
./pkt2xml -d mynetwork.pkt mynetwork.xml
```

### Edit the XML
Open `mynetwork.xml` in any text editor and modify device configurations:
```xml
<RUNNINGCONFIG>
  <LINE>interface FastEthernet0/0</LINE>
  <LINE> ip address 192.168.1.1 255.255.255.0</LINE>
  <LINE> no shutdown</LINE>
</RUNNINGCONFIG>
```

### Convert Back to PKT
```bash
./xml2pkt mynetwork.xml mynetwork.pkt
```

Now open `mynetwork.pkt` in Packet Tracer - your changes are there!

## How Does the Encryption Work?

Packet Tracer uses a multi-layer approach to protect/compress its files. Here's what happens when you save a `.pkt` file:

### The Layers (Like an Onion 🧅)

**Layer 1: Compression**
- Your network data gets compressed using zlib
- The first 4 bytes store the original uncompressed size
- This makes files smaller for storage

**Layer 2: Encryption**
- Uses **Twofish** cipher (a strong symmetric encryption algorithm)
- Runs in **EAX mode** (authenticated encryption - prevents tampering)
- Key: 16 bytes, all set to `137` (0x89)
- IV (initialization vector): 16 bytes, all set to `16` (0x10)
- For `.pkt`/`.pka` files specifically

**Layer 3: Obfuscation**
- A simple XOR-based scrambling to make the data look random
- Formula: `output[i] = input[length - 1 - i] XOR (length - i * length)`
- Basically reverses bytes and XORs them with position-based values
- Not real security, just makes it harder to recognize patterns

### Different File Types, Different Keys

Packet Tracer uses different encryption keys for different file types:

| File Type | Cipher | Key | IV |
|-----------|--------|-----|-----|
| `.pkt` / `.pka` | Twofish-EAX | `{137}×16` | `{16}×16` |
| `nets` files | Twofish-EAX | `{186}×16` | `{190}×16` |
| `log` files | CAST256-EAX | `{18}×16` | `{254}×16` |

### Why This Matters

The keys are **hardcoded** into Packet Tracer itself, which means:
- ✅ Anyone with the keys can decrypt files (including this tool!)
- ✅ You can edit files programmatically
- ⚠️ It's not truly secure encryption - more like "obfuscation"
- 🤓 Cisco probably did this for licensing/DRM, not security

Think of it like a locked treasure chest where everyone has the same key.

## Building from Source

### Prerequisites
Install the required libraries:

```bash
# Ubuntu/Debian
sudo apt install build-essential libcrypto++-dev libzip-dev libre2-dev zlib1g-dev

# Arch Linux
sudo pacman -S crypto++ libzip re2 zlib

# macOS
brew install cryptopp libzip re2 zlib
```

### Build Static Binary (Recommended)
```bash
make static-install
```

This creates standalone binaries that work anywhere.

### Build Dynamic Binary
```bash
make dynamic-install
```

Smaller binaries, but requires libraries to be installed on the system.

### Build with Docker
```bash
docker build -t pka2xml:1.0 .
docker run -it pka2xml:1.0
```

## Tools Included

### 1. `pkt2xml` - Main Converter
```bash
# Decrypt PKT/PKA to XML
pkt2xml -d network.pkt network.xml

# Encrypt XML to PKT/PKA
pkt2xml -e network.xml network.pka

# Decrypt "nets" file (Packet Tracer user data)
pkt2xml -nets ~/.packettracer/nets

# Decrypt log files
pkt2xml -logs ~/.packettracer/pt_12.05.2020_21.07.17.338.log

# Make file compatible with any PT version
pkt2xml -f network.pkt network_universal.pkt

# Forge authentication file (bypass login)
pkt2xml --forge auth.xml
```

### 2. `xml2pkt` - Standalone Converter
Simpler tool that just does XML → PKT conversion:

```bash
xml2pkt mynetwork.xml mynetwork.pkt
```

### 3. `graph.py` - Network Visualizer
Generate topology diagrams from XML files:

```bash
python3 graph.py network.xml network.png
```

Creates a visual graph of your network topology!

### 4. `patch.c` - Packet Tracer Patcher
Launch Packet Tracer with useful patches:
- Bypass login screen
- Show all activities as completed
- Unlock locked interfaces
- Prevent activity reset on user change

## Real-World Use Cases

### 1. Bulk Configuration Changes
You have 50 routers that all need the same NTP server? Edit the XML with a script:

```python
import re
with open('network.xml', 'r') as f:
    content = f.read()

# Add NTP server to all router configs
content = re.sub(
    r'(<RUNNINGCONFIG>)',
    r'\1\n      <LINE>ntp server 192.168.1.100</LINE>',
    content
)

with open('network.xml', 'w') as f:
    f.write(content)
```

Then convert back to PKT and you're done!

### 2. Configuration Templates
Create network templates programmatically:
- Generate base configs
- Apply consistent naming conventions
- Set up HSRP, VLANs, routing protocols automatically
- No more manual clicking in the GUI!

### 3. Version Control Your Networks
Store your networks in Git as XML:
```bash
./pkt2xml -d network.pkt network.xml
git add network.xml
git commit -m "Added OSPF to core routers"
```

Now you can track changes, review diffs, and collaborate!

### 4. Automated Testing
Build CI/CD pipelines for network labs:
```bash
# Generate test network
./generate_network.py > test.xml
./xml2pkt test.xml test.pkt

# Test in PT
./run_pt_tests.sh test.pkt

# Validate results
./pkt2xml -d test.pkt test_output.xml
./validate_config.py test_output.xml
```

### 5. Extract Configurations
Pull running configs from PKT files without opening Packet Tracer:

```bash
./pkt2xml -d backup.pkt backup.xml
grep -A 50 "RUNNINGCONFIG" backup.xml > router_config.txt
```

## How Device Configurations Are Stored

Inside the XML, each device has two config sections:

```xml
<DEVICE>
  <NAME>Router1</NAME>
  <SYS_NAME>R1</SYS_NAME>
  
  <RUNNINGCONFIG>
    <LINE>!</LINE>
    <LINE>interface GigabitEthernet0/0</LINE>
    <LINE> ip address 192.168.1.1 255.255.255.0</LINE>
    <LINE> no shutdown</LINE>
    <LINE>!</LINE>
  </RUNNINGCONFIG>
  
  <STARTUPCONFIG>
    <!-- Same as RUNNINGCONFIG for persistent configs -->
  </STARTUPCONFIG>
</DEVICE>
```

- `<NAME>` = Display name in Packet Tracer GUI
- `<SYS_NAME>` = Actual hostname in IOS
- `<RUNNINGCONFIG>` = Current active configuration
- `<STARTUPCONFIG>` = Configuration saved to NVRAM

Each command is a separate `<LINE>` element. To edit:
1. Find the device by `<SYS_NAME>`
2. Modify the `<LINE>` elements
3. Update **both** RUNNINGCONFIG and STARTUPCONFIG
4. Convert back to PKT

## Tips and Tricks

### Always Edit Both Configs
When modifying configs, change both `<RUNNINGCONFIG>` and `<STARTUPCONFIG>`:
```xml
<!-- Do this -->
<RUNNINGCONFIG>
  <LINE>ip route 0.0.0.0 0.0.0.0 192.168.1.254</LINE>
</RUNNINGCONFIG>
<STARTUPCONFIG>
  <LINE>ip route 0.0.0.0 0.0.0.0 192.168.1.254</LINE>
</STARTUPCONFIG>
```

Otherwise your changes disappear after reload!

### Preserve XML Formatting
When editing, keep the exact spacing and indentation. XML parsers are picky.

### Test Small Changes First
Before bulk editing 100 devices, test on one device to make sure it works.

### Keep Backups
Always keep a backup of your original PKT file:
```bash
cp network.pkt network.pkt.backup
```

### Round-Trip Test
Verify your edits work by converting back and forth:
```bash
./pkt2xml -d original.pkt test1.xml
./xml2pkt test1.xml modified.pkt
./pkt2xml -d modified.pkt test2.xml
diff test1.xml test2.xml  # Should be identical
```

## Troubleshooting

**"Decryption failed"**
- Make sure you're using a valid PKT/PKA file
- File might be corrupted
- Try with a fresh export from Packet Tracer

**"XML parsing error"**
- Check for syntax errors in your XML
- Make sure you didn't break the structure
- Use an XML validator before converting back

**"Changes don't appear in Packet Tracer"**
- Did you edit both RUNNINGCONFIG and STARTUPCONFIG?
- Check the device name matches (use `<SYS_NAME>`, not `<NAME>`)
- Verify XML conversion completed successfully

**"Binary won't run"**
- Try building static binary: `make static-install`
- Check library dependencies: `ldd ./pkt2xml`

## Project Structure

```
pka2xml/
├── main.cpp              # Main pkt2xml tool
├── xml2pkt.cpp           # Standalone XML→PKT converter
├── patch.c               # Packet Tracer patcher
├── graph.py              # Network topology visualizer
├── include/
│   └── pka2xml.hpp       # Encryption/decryption functions
├── reversing/            # Reverse engineering notes
├── examples/             # Example networks
├── Makefile              # Build configuration
└── README.md             # This file
```

## Credits

**Original Project:** [pka2xml by Mirco De Zorzi](https://github.com/mircodz/pka2xml)
- Reverse engineered Packet Tracer's encryption
- Created the original decryption/encryption implementation
- Detailed blog post: [Reversing Packet Tracer](https://mircodezorzi.github.io/doc/reversing-packet-tracer/)

**This Fork:**
- Added `xml2pkt` standalone converter
- Added practical examples and use cases
- Enhanced documentation for real-world usage
- Created configuration editing guides

## License

BSD 2-Clause License - See LICENSE file for details.

Original work Copyright (c) 2020, Mirco De Zorzi

## Contributing

Found a bug? Have a feature request? Open an issue or pull request!

## Disclaimer

This tool is for educational and automation purposes. Always respect Cisco's licensing terms when using Packet Tracer.

---

**Happy network automating! 🚀**

*Now stop clicking through 50 router configurations manually and start scripting like a pro!*
