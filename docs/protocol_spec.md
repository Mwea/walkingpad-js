# WalkingPad Protocol Specification

## 1. Supported Protocols

### A. Standard Proprietary (V1)
Used by A1, R1, P1 models.

*   **Service UUIDs:** `0000fe00-...` (Primary), `0000fff0-...` (Generic Fallback)
*   **Characteristics:**
    *   **Write:** `0000fe01-...` or `0000fff2-...`
    *   **Notify:** `0000fe02-...` or `0000fff1-...`

#### Packet Format
| Byte | Description | Value |
|------|-------------|-------|
| 0    | Header 1    | `0xf7` (Cmd) / `0xf8` (Resp) |
| 1    | Header 2    | `0xa2` |
| ...  | Payload     | Variable |
| N-1  | Checksum    | `sum(bytes[1..N-2]) % 256` |
| N    | Suffix      | `0xfd` |

#### Commands
*   **Ask Stats:** `[0xf7, 0xa2, 0x00, ..., checksum, 0xfd]`
*   **Start:** Mode Manual `0x04, 0x01`
*   **Stop:** Mode Standby `0x04, 0x00`
*   **Set Speed:** `0x03, speed_value` (speed * 10)

#### Status Response (Parsed)
*   **State:** Byte 2
*   **Speed:** Byte 3 (/10.0 km/h)
*   **Mode:** Byte 4
*   **Time:** Bytes 5-7 (Big Endian uint24)
*   **Distance:** Bytes 8-10 (Big Endian uint24, units of 10m)
*   **Steps:** Bytes 11-13 (Big Endian uint24)

---

### B. Fitness Machine Service (FTMS)
Used by newer international models (e.g., Z1, R2, C2).

*   **Service UUID:** `00001826-0000-1000-8000-00805f9b34fb`
*   **Characteristics:**
    *   **Control Point:** `00002ad9-...` (Write/Indicate)
    *   **Treadmill Data:** `00002acd-...` (Notify)

#### Control Point Commands
*   **Start/Resume:** OpCode `0x07`
*   **Stop/Pause:** OpCode `0x08`, Param `0x01` (Stop)
*   **Set Target Speed:** OpCode `0x02`, Param `uint16` (km/h * 100)

#### Treadmill Data Packet
Standard BLE GATT specification with vendor quirks.

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0-1    | Flags | uint16 | Determines presence of following fields |
| 2-3    | Inst. Speed | uint16 | Mandatory. 0.01 km/h |
| ...    | ... | ... | Optional fields (Distance, Energy, Time) based on flags |
| End-X  | Steps | uint16 | **Vendor Extension**. Found at end of packet on some models. |

## 2. Protocol Detection Logic

To automatically select the correct protocol:

1.  **Scan Services:** List all advertised service UUIDs.
2.  **Check FTMS:** If `00001826` is present, select **FTMS Protocol**. (Preferred standard).
3.  **Check Proprietary:** If `0000fe00` is present, select **Standard Protocol**.
4.  **Fallback:** If `0000fff0` or `0000ffc0` is present:
    *   Try **Standard Protocol** first (send status request).
    *   If no response, log warning (unknown protocol).

