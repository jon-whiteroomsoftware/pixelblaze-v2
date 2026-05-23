## Pixelblaze V3 Standard: Quick Start

Get your v3 up and running in 3 easy steps!

1.  [WiFi Setup](https://electromage.com/docs/quickstart-v3-standard#step1)
2.  [Configure Settings](https://electromage.com/docs/quickstart-v3-standard#step2)
3.  [Connect LEDs](https://electromage.com/docs/quickstart-v3-standard#step3)

![Pixelblaze V3 Standard Connections](https://electromage.com/img/PB%20V3%20Standard%20left%20pins.jpg)

## Step 1: WiFi Setup

To set up your Pixelblaze, start by connecting it to USB power, or providing 5 VDC via the VIN and GND pins on the LED connection header.

**WARNING:** Never connect both USB and external power at the same time!

Once your Pixelblaze is powered up, it will automatically go in to WiFi setup mode. Look for a new wireless network called "Pixelblaze\_" followed by a six-character identifier. If you do not see it, sometimes toggling WiFi on your computer/phone/tablet can help.

Note: Some mobile device operating systems will warn that this setup WiFi network does not provide internet access. If your mobile device prompts you this way, choose to stay connected to this network.

Once you connect, your browser should automatically load the Pixelblaze setup page. If not, go to:

[http://192.168.4.1](http://192.168.4.1/)

If you are unable to load this page, first check that you are still connected to the Pixelblaze\_XXXXXX WiFi network. On a phone, sometimes turning mobile data off temporarily can help if you are unable to connect.

### Choose a WiFi Mode

You can use Pixelblaze in one of two modes: 1) Client Mode where it connects to an existing WiFi network, or 2) AP Mode in which it creates its own WiFi network that you will connect to from a computer or mobile device.

-   Use **Client Mode** if you want to connect the Pixelblaze to your home network or need clock/time functions. This is convenient when developing patterns on a computer because you can access Pixelblaze and online resources at the same time.
    
    **Client Mode** is also the easiest way to check for and install [firmware updates](https://forum.electromage.com/tags/c/news-and-announcements/10/release).
    
    Enabling the Discovery Service is highly reccomended so you can easily find your Pixelblaze on your home network. Disable it to prevent Pixelblaze from registering itself with ElectroMage's Discovery Service.
    
    ![Screenshot of the Pixelblaze Discovery Service site](https://electromage.com/img/enable_discovery_service.webp)
    
-   Use **AP Mode** if there's no other WiFi or your Pixelblaze will be mobile (as used in a wearable, for example), and you need to be able to control it from a mobile device anywhere.

### Finding Pixelblaze in Client Mode

Once the controller has connected to WiFi, it will have an IP address on your network.

If you enabled the cloud discovery service, you can find your Pixelblaze by visiting the discover page from a device on the same network:

[http://discover.electromage.com](http://discover.electromage.com/)

If you did not enable the cloud discovery feature, you'll need to find your Pixelblaze's IP address to use it. [These instructions for finding a raspberry pi](https://www.raspberrypi.org/documentation/remote-access/ip-address.md) without a display provide a good outline of ways to find a device on your network. If you use the nmap method e.g.:

```
nmap -sn 192.168.1.0/24
```

The controller hostname will likely start with "ESP\_" or "Espressif" followed by some hexadecimal characters.

### Pixelblaze in AP Mode

If using AP Mode to create a new WiFi network, choose a password at least 8 characters long (fewer characters won't work). After connecting to this network, you can always find it at:

[http://192.168.4.1](http://192.168.4.1/)

As during Pixelblaze setup, some mobile device operating systems will warn that this WiFi network does not provide internet access. If your mobile device prompts you this way, stay connected to this network.

### Resetting WiFi Settings / Getting Back to WiFi Setup Mode

If you need to go back to setup mode, supply power to your Pixelblaze, either through USB or the VIN and GND pins, then press and hold the button for 5 seconds. Shorter presses will switch patterns. The orange status LED will blink 3 times to let you know you are in Setup Mode.

## Step 2: Configure Settings

Once your Pixelblaze is online and you can connect to it, the next step is to configure the settings for your LEDs.

![The Pixelblase settings page](https://electromage.com/img/pixelblaze_settings_page.webp)

On the settings tab:

# Pixelblaze V3 Standard: Quick Start

-   Name your Pixelblaze so you can find it more easily. This will set the name that appears in the Discovery Service page and in other places.
    
-   Configure your Pixelblaze for the type of LEDs you are using, the number of LEDs (using the Pixels field), and the LED color order.
    
    For RGBW LEDs, be sure to select an RGBW color order.
    
    If you aren't sure which type of LED you have please see the manufacturer or vendor’s website.
    
    The color order can be determined experimentally by activating the pattern titled "An Intro to Pixelblaze Code". Then try the different orders in the Settings tab until your LEDs show a moving sequence of Red, Green, then Blue pixels.
    
-   Configure other settings. You can set the timezone, auto-off, brightness limit, and more.
    
-   If using one or more [Output Expanders](https://electromage.com/docs/output-expander), change the LED type to "Pixelblaze Output Expander", then click the "Add Board" button for each expander. In each panel, configure the output channels. For best results, ensure a contiguous pixel address space (without gaps or overlapping sections).
    

## Step 3: Connect LEDs

**WARNING:** If you’re powering Pixelblaze from the MicroUSB connector, do not connect more than 30 LEDs until you limit the brightness in Settings to allow for more.

Once LED settings are configured for your type of LEDs, power off Pixelblaze and connect your LEDs.

If you're powering Pixelblaze off a separate power supply (rather than the MixroUSB connector), then Pixelblaze must have a common ground (GND) connection to that power supply.

**For APA102 / SK9822 / WS2801 LEDS:** Connect both DAT and CLK signals, as well as GND.

**For WS2811 / WS2812 / WS2813 / WS2815 / GS8208 / SK6812 LEDs:** Connect the data signal (DAT) and ground (GNG). Pixelblaze's DAT pin should be connected to the LEDs' wire or pad labeled DAT or DI. If the LED supports a backup data signal, connect the first pixel's backup data input to GND.

For visual wiring examples, and especially if you have 12 V LEDs or strips with a backup data line, it's important you continue reading the [LED section of the Hardware Getting Started guide](https://electromage.com/docs/hardware-getting-started#connecting-leds).

## What's Next?

Now's a good time to explore the built-in app's UI and IDE. It lets you select patterns, configure a playlist, and much more. For a guided overview, see the [User Interface](https://electromage.com/docs/user-interface) guide.

![](https://electromage.com/img/patterns_page.png)