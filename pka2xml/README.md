# PKT2XML - Cisco Packet Tracer File Converter

Got curious and thought "how it works", tampered around with **gdb** and extracted the plain xml from packettracer memory. found a guy make pkt2xml already to directly convert `.pkt` file, made it work.

## What Does This Do?

Cisco Packet Tracer stores network simulations in encrypted, compressed binary files. This tool:
- **Decrypts** and converts `.pkt`/`.pka` files into readable XML
- **Encrypts** and converts XML back into `.pkt`/`.pka` files
- Lets you **edit device configurations** by modifying XML directly
- feed xml into scripts for convenience

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

## Encryption

Packet Tracer uses a multi-layer approach to protect/compress its files. Here's what happens when you save a `.pkt` file:

### The Layers

**Layer 1: Compression**
- Your network data gets compressed using zlib
- The first 4 bytes store the original uncompressed size
- This makes files smaller for storage

**Layer 2: Encryption**
- Uses **Twofish** cipher
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

### Build Dynamic Binary
```bash
make dynamic-install
```


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
