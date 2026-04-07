# How to Edit Packet Tracer Configurations via XML

This guide shows you how to edit device configurations in Packet Tracer by converting to XML, making changes, and converting back.

## Quick Workflow

```bash
# 1. Convert PKT to XML
./pkt2xml -d mynetwork.pkt mynetwork.xml

# 2. Edit the XML file
# (Use your favorite text editor)

# 3. Convert back to PKT
./xml2pkt mynetwork.xml mynetwork.pkt

# 4. Open in Packet Tracer
# Your changes are now in the file!
```

## Understanding the XML Structure

### Device Configuration Format

Each device in the XML has this basic structure:

```xml
<DEVICE>
  <NAME>Router1</NAME>           <!-- Display name in PT GUI -->
  <SYS_NAME>R1</SYS_NAME>        <!-- Actual device hostname -->
  <TYPE>Router</TYPE>
  
  <RUNNINGCONFIG>                <!-- Active configuration -->
    <LINE>!</LINE>
    <LINE>interface GigabitEthernet0/0</LINE>
    <LINE> ip address 192.168.1.1 255.255.255.0</LINE>
    <LINE> no shutdown</LINE>
    <LINE>!</LINE>
    <LINE>interface GigabitEthernet0/1</LINE>
    <LINE> ip address 10.0.0.1 255.255.255.0</LINE>
    <LINE> no shutdown</LINE>
    <LINE>!</LINE>
  </RUNNINGCONFIG>
  
  <STARTUPCONFIG>                <!-- Saved configuration -->
    <!-- Should match RUNNINGCONFIG for persistent changes -->
  </STARTUPCONFIG>
</DEVICE>
```

### Key Points

1. **Two Config Sections**: Always update BOTH `<RUNNINGCONFIG>` and `<STARTUPCONFIG>`
2. **Each Command = One Line**: Every IOS command is a separate `<LINE>` element
3. **Spacing Matters**: Notice the space before ` ip address` - it shows it's under an interface
4. **Exclamation Marks**: `<LINE>!</LINE>` separates config sections (just like IOS)

## Example Edits

### 1. Change IP Address

**Before:**
```xml
<LINE>interface GigabitEthernet0/0</LINE>
<LINE> ip address 192.168.1.1 255.255.255.0</LINE>
```

**After:**
```xml
<LINE>interface GigabitEthernet0/0</LINE>
<LINE> ip address 10.0.0.1 255.255.255.0</LINE>
```

Do this in BOTH `<RUNNINGCONFIG>` and `<STARTUPCONFIG>`.

### 2. Add a Static Route

Find the end of the running config, before the closing `</RUNNINGCONFIG>`:

```xml
<LINE>!</LINE>
<LINE>ip route 0.0.0.0 0.0.0.0 192.168.1.254</LINE>
<LINE>!</LINE>
</RUNNINGCONFIG>
```

Add the same to `<STARTUPCONFIG>`.

### 3. Configure HSRP

Add HSRP to a VLAN interface:

```xml
<LINE>interface Vlan10</LINE>
<LINE> ip address 192.168.10.2 255.255.255.0</LINE>
<LINE> standby 10 ip 192.168.10.1</LINE>
<LINE> standby 10 priority 110</LINE>
<LINE> standby 10 preempt</LINE>
<LINE> no shutdown</LINE>
<LINE>!</LINE>
```

### 4. Create VLANs on a Switch

```xml
<LINE>vlan 10</LINE>
<LINE> name SALES</LINE>
<LINE>!</LINE>
<LINE>vlan 20</LINE>
<LINE> name ENGINEERING</LINE>
<LINE>!</LINE>
<LINE>vlan 30</LINE>
<LINE> name MANAGEMENT</LINE>
<LINE>!</LINE>
```

### 5. Configure Trunk Port

```xml
<LINE>interface FastEthernet0/1</LINE>
<LINE> switchport trunk native vlan 99</LINE>
<LINE> switchport trunk encapsulation dot1q</LINE>
<LINE> switchport mode trunk</LINE>
<LINE>!</LINE>
```

## Finding Devices in XML

### Search by Hostname

Search for `<SYS_NAME>` tags:

```bash
grep -n "SYS_NAME" mynetwork.xml
```

Output:
```
1234:<SYS_NAME>R1</SYS_NAME>
5678:<SYS_NAME>SW1</SYS_NAME>
9012:<SYS_NAME>R2</SYS_NAME>
```

### Extract a Single Device Config

```bash
# Get line numbers for a specific device
grep -n "<SYS_NAME>R1</SYS_NAME>" mynetwork.xml

# Then use sed to extract lines around it
sed -n '1234,1500p' mynetwork.xml > r1_config.xml
```

## Scripting Configuration Changes

### Python Example: Bulk IP Change

```python
#!/usr/bin/env python3
import re

# Read XML
with open('network.xml', 'r') as f:
    content = f.read()

# Change all 192.168.1.x to 10.0.1.x
content = re.sub(
    r'192\.168\.1\.(\d+)',
    r'10.0.1.\1',
    content
)

# Write back
with open('network_modified.xml', 'w') as f:
    f.write(content)

print("✓ IP addresses updated!")
```

### Python Example: Add Command to All Routers

```python
#!/usr/bin/env python3
import re

with open('network.xml', 'r') as f:
    content = f.read()

# Find all router RUNNINGCONFIG sections and add NTP server
pattern = r'(<DEVICE>.*?<TYPE>Router</TYPE>.*?<RUNNINGCONFIG>)'
replacement = r'\1\n      <LINE>ntp server 192.168.1.100</LINE>'

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Do the same for STARTUPCONFIG
pattern = r'(<DEVICE>.*?<TYPE>Router</TYPE>.*?<STARTUPCONFIG>)'
content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('network_with_ntp.xml', 'w') as f:
    f.write(content)

print("✓ NTP server added to all routers!")
```

## Important Rules

### ✅ DO:
- Edit both RUNNINGCONFIG and STARTUPCONFIG
- Preserve XML indentation and spacing
- Use `<LINE>!</LINE>` to separate config sections
- Keep command spacing (leading spaces for sub-commands)
- Test on a backup copy first
- Verify round-trip conversion works

### ❌ DON'T:
- Delete XML structure tags (`<DEVICE>`, `<RUNNINGCONFIG>`, etc.)
- Mix up device names (`<NAME>` vs `<SYS_NAME>`)
- Forget the `<LINE>` tags around each command
- Edit only RUNNINGCONFIG (changes won't survive reload)
- Use invalid IOS commands (PT will ignore them)

## Verification Steps

After editing XML and converting back to PKT:

1. **Test the conversion:**
   ```bash
   ./xml2pkt modified.xml test.pkt
   ```

2. **Verify round-trip:**
   ```bash
   ./pkt2xml -d test.pkt verify.xml
   diff modified.xml verify.xml
   ```
   
3. **Open in Packet Tracer:**
   - Load the PKT file
   - Check device configurations: `show running-config`
   - Verify changes are present

4. **Test functionality:**
   - Ping between devices
   - Check routing tables
   - Verify protocols are working

## Common Pitfalls

### Whitespace Issues

**Wrong:**
```xml
<LINE>interface GigabitEthernet0/0</LINE>
<LINE>ip address 192.168.1.1 255.255.255.0</LINE>  <!-- Missing space! -->
```

**Correct:**
```xml
<LINE>interface GigabitEthernet0/0</LINE>
<LINE> ip address 192.168.1.1 255.255.255.0</LINE>  <!-- Note the leading space -->
```

### Missing Both Configs

If you only edit RUNNINGCONFIG, the changes disappear when you:
- Reload the device in PT
- Close and reopen the file

**Always edit both sections!**

### Invalid IOS Commands

Packet Tracer might accept invalid commands in XML but ignore them at runtime. Test in PT to verify.

## Advanced: Programmatic Generation

You can generate entire network configs from scratch:

```python
#!/usr/bin/env python3

def create_vlan_config(vlan_id, name):
    return f"""      <LINE>vlan {vlan_id}</LINE>
      <LINE> name {name}</LINE>
      <LINE>!</LINE>"""

vlans = [
    (10, "SALES"),
    (20, "ENGINEERING"),
    (30, "MANAGEMENT"),
]

config = []
for vid, vname in vlans:
    config.append(create_vlan_config(vid, vname))

vlan_section = "\n".join(config)
print(vlan_section)
```

Then insert this into your XML template!

## Tips

1. **Use version control**: Store XML in git to track changes
2. **Create templates**: Build reusable config snippets
3. **Automate testing**: Script the entire workflow for CI/CD
4. **Comment your scripts**: Document what each change does
5. **Keep backups**: Always backup original PKT files

## Need Help?

If your changes don't work:
1. Check XML syntax with `xmllint mynetwork.xml`
2. Verify IOS command syntax
3. Test on a simple network first
4. Compare with working examples
5. Check Packet Tracer console for errors

---

**Happy automating!** 🛠️
