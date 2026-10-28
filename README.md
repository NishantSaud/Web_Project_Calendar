# Day Ledger

A minimal black-and-white calendar with a live digital clock, built with plain HTML, CSS and JavaScript. No build step and no dependencies.

## Features

- Digital clock in Nepal time (Asia/Kathmandu) with seconds, full date, and a 12h / 24h toggle
- Month calendar with previous / next navigation and a "Jump to today" button
- Today is a solid circle, the selected date has a ring, Saturday is dimmed as the weekend
- Dot under a date: solid for an event, hollow for a reminder
- Single click a date to see its events and reminders
- Double click a date to add a new one
- Each entry has a date, optional start time, optional end time, type and note
- Edit and delete entries, including moving them to another date
- "Next up" line under the clock
- Alert when an entry's start time arrives (in-page banner, plus a browser notification if you click "Enable alerts")
- Events are saved in the browser with `localStorage`
- Download your events as `events.json` and import them again from the page, to back up or move them to another browser

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Monochrome styling, light and dark mode |
| `script.js` | Clock, calendar, events, alerts and storage |
| `events.json` | Starting events, loaded the first time the page opens |

## Run locally

Open `index.html` in a browser. 

