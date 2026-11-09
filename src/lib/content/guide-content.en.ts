import type { GuideSection } from './guide-content';

export const enSoftwareGuideSections: GuideSection[] = [
  {
    id: 'dung-web',
    icon: '📱',
    title: 'Using the Website & App',
    shortTitle: 'Using Web',
    keywords: ['home', 'search', 'dark mode', 'night mode', 'epub', 'practice', 'reading'],
    editorialStatus: 'verified-software',
    introduction: [
      'The application is thoughtfully optimized for smooth, elegant reading on both mobile phones and desktop browsers, featuring eye-comfort Light and Dark themes.',
    ],
    topics: [
      {
        "id": "giao-dien-va-chuyen-dong",
        "title": "Appearance, Language & Motion",
        "keywords": [
          "motion effects",
          "water ripples",
          "reduced motion",
          "font size"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open display settings",
                "text": "Go to Personal > Application settings > Appearance & language to adjust the theme, language, text size and motion effects."
              },
              {
                "title": "Turn motion on or off",
                "text": "Motion effects are enabled by default. Turning them off stops water ripples in the mala and meditation screens; counters, timers and audio keep their own controls. This preference stays on the device."
              },
              {
                "title": "Respect system preferences",
                "text": "System Reduce Motion takes precedence even if effects are enabled in the application."
              }
            ]
          }
        ]
      },
      {
        "id": "widget-man-hinh-chinh",
        "title": "Home-screen Widgets",
        "keywords": [
          "widget",
          "calendar",
          "Dharma audio",
          "practice",
          "home screen"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Add a widget",
                "text": "On Android or iOS, open the home-screen widget picker, find the application and choose a suitable size. Types appear as Calendar, Dharma Audio and Practice; the launcher or operating system controls the picker layout."
              },
              {
                "title": "Open the intended content",
                "text": "Calendar opens the selected date. Dharma Audio uses the shared player. Practice opens the displayed tool or content; opening a tool does not mark practice completed."
              },
              {
                "title": "When content is unavailable",
                "text": "Open the application to choose content, update data or finish offline downloads. Audio requires a network unless downloaded. System widget refresh may be delayed and is not guaranteed every minute."
              }
            ]
          }
        ]
      },
      {
        "id": "cap-nhat-noi-dung",
        "title": "Manual Content Update",
        "keywords": [
          "manual content update",
          "new books",
          "download size"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Check when needed",
                "text": "At the bottom of Home, choose Update content. Checking starts only after you press the button; opening this guide does not check or download content."
              },
              {
                "title": "Review size and confirm",
                "text": "Review the estimated MB and choose Download content. Regular books, sutras and rituals download in full; PDFs and Dharma albums include only covers and lists. Download PDF files in the reader and audio in the album."
              },
              {
                "title": "Retry incomplete items",
                "text": "Failed items retain previously saved copies. Check again to retry missing items; unchanged completed versions are skipped."
              },
              {
                "title": "Content versus application version",
                "text": "This updates supported content rather than application code. New interfaces or tools may require an application update from the store or an appropriate installer."
              }
            ]
          }
        ]
      },
      {
        id: 'trang-chu-va-tim-kiem',
        title: 'Home Page — Dharma Library & Buddhist Books',
        keywords: ['search articles', 'categories', 'karma', 'buddhist sutras', 'epub'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Quick Article Search', text: 'Type keywords into the search box or select a category (Buddhist Sutras, Wholesome Books, Shurangama Mantra...) to instantly filter the teachings you wish to read.' },
              { title: 'Comfortable Reading Experience', text: 'Tap any article to enter the reader. The toolbar allows scaling font size, changing paper background (Light, Sepia Cream, Dark), AI text-to-speech audio, bookmarking, and offline reading.' },
              { title: 'Continue Reading Where You Left Off', text: 'The "Continue Reading" shelf remembers your exact reading spot across chapters; simply tap to resume effortlessly.' },
              { title: 'Eye-Comfort Light / Dark Mode', text: 'Tap the LIGHT / DARK button at the top to switch to night mode and eliminate glare. All preferences save automatically.' },
            ],
          },
        ],
      },
      {
        id: 'tu-tap-tren-web',
        title: 'Practice Page — Daily Chanting & Cultivation',
        keywords: ['start practice', 'floating button', 'wooden fish', 'meditation music', 'auto scroll'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Choose Practice Session', text: 'Go to Practice and select your chanting text (Shurangama Mantra, Great Compassion Mantra, Repentance rituals...) suitable for morning or evening devotion.' },
              { title: 'Start Cultivation Session', text: 'Tap "Start Practice" to enter distraction-free full-screen reading. As you scroll down, top navigation gently tucks away for maximum screen space.' },
              { title: 'Draggable Floating Tools', text: 'The floating "⚙ Tools" bubble can be dragged with your finger to any corner of the screen so it never obstructs sutra text.' },
              { title: 'Wooden Fish & Zen Bell Music', text: 'Turn on rhythmic wooden fish beats and peaceful meditation sounds to calm, steady, and anchor your mind during recitation.' },
            ],
          },
        ],
      },
      {
        id: 'dong-bo-nut-quay-lai-android',
        title: 'Android Back Button & Gesture Navigation',
        keywords: ['back button', 'android gestures', 'swipe edge', 'exit book', 'table of contents'],
        blocks: [
          {
            type: 'paragraph',
            text: 'The app natively integrates with Android hardware Back buttons and edge-swipe gestures, providing fluid and predictable navigation without accidental app closures:',
          },
          {
            type: 'cards',
            items: [
              {
                title: 'Reading Books & PDFs',
                text: 'Reading a chapter: Back returns to the Table of Contents. In Table of Contents: Back closes the book and returns to the Library. When toolbars or zoomed images are open: Back dismisses the overlay first.',
              },
              {
                title: 'During Buddhist Practice',
                text: 'Previewing a text: Back returns to the practice catalog. During an active chanting session: Back prompts an exit confirmation so your progress is never lost. On virtual beads: Back auto-saves your count to the Practice Log.',
              },
              {
                title: 'Listening to Dharma Talks',
                text: 'Viewing lectures in an album: Back returns to the album collection.',
              },
            ],
          },
        ],
      },
      {
        id: 'doc-offline-khong-can-mang',
        title: 'Offline Reading — No Internet Required',
        keywords: ['offline', 'no internet', 'offline reading', 'airplane mode', 'cached'],
        blocks: [
          {
            type: 'paragraph',
            text: 'All 67 core Buddhist sutras, cultivation rituals, and wholesome books are bundled directly into device storage:',
          },
          {
            type: 'steps',
            items: [
              { title: 'Read Anywhere, Anytime', text: 'At temples, remote retreats without Wi-Fi, or on flights in Airplane mode, open and read with 100% offline reliability.' },
              { title: 'Automatic Local Saving', text: 'Your reading position, bookmarks, and local practice counts are safely preserved on your device.' },
              { title: 'Sync When Reconnected', text: 'Once internet connection returns, practice streaks, notes, and reading progress automatically synchronize with your cloud account.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'doc-sach',
    icon: '📖',
    title: 'Reading Books, PDFs & Quotations',
    shortTitle: 'Read Books',
    keywords: ['pdf', 'two page', 'thumbnail', 'table of contents', 'sepia', 'highlight', 'notes', 'tts', 'offline'],
    editorialStatus: 'verified-software',
    introduction: [
      'Smart reading features: auto-remembering pages, dynamic font scaling, audio text-to-speech, and personal quote highlights.',
    ],
    topics: [
      {
        id: 'doc-pdf',
        title: 'Text Books & PDF Document Reader',
        keywords: ['two page', 'outline', 'thumbnail', 'zoom', 'fit screen', 'sepia'],
        blocks: [
          {
            type: 'cards',
            items: [
              { title: 'Single or Two-Page View', text: 'On tablets or PCs, enable two-page mode to turn pages like a printed book; mobile phones automatically format in clean single-page view.' },
              { title: 'Table of Contents & Quick Jump', text: 'Tap Table of Contents to jump directly to any chapter, or use Previous / Next chapter buttons at the header.' },
              { title: 'Auto-Hiding Reader Toolbar', text: 'When scrolling to read, the top navigation smoothly slides out of view. Gently swipe upward to bring the menu back immediately.' },
              { title: 'PDF Bookmarks & Bookmark List', text: 'The bottom floating bar allows tapping 🔖 to bookmark the current page or open your bookmarks list to jump rapidly between favorite passages.' },
              { title: 'Font Size & Paper Backgrounds', text: 'Adjust font size A- / A+, choose warm sepia cream paper to relieve eye fatigue, or use dark mode for nighttime reading.' },
            ],
          },
        ],
      },
      {
        id: 'chi-tiet-thanh-cong-cu-doc',
        title: 'Complete Guide to “⚙ Reader Toolbar” Buttons',
        keywords: ['reader tools', 'font size', 'font family', 'bold', 'line height', 'paper background', 'bookmark', 'listen', 'share', 'download', 'auto scroll'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: '1. Font Size (A− / A+)', text: 'Tap A− to shrink or A+ to enlarge text to your most comfortable reading size (from 13px up to 45px).' },
              { title: '2. Font Family', text: 'Choose your preferred typeface: Bookerly (classic book typography), Merriweather, Literata, or Be Vietnam Pro.' },
              { title: '3. Typography (Bold B & Line Spacing)', text: 'Toggle Bold B for thicker strokes; select 1.6×, 1.9×, or 2.2× to customize line height for optimal readability.' },
              { title: '4. Paper Colors', text: '4 soothing backgrounds: White (crisp daylight), Warm Sepia Cream (eye-friendly for long sessions), Gray (soft neutral), and Dark (night mode).' },
              { title: '5. Bookmark (🔖)', text: 'Mark your current reading page. A subtle golden ribbon will indicate the page for quick 1-tap return.' },
              { title: '6. Listen (🔊 AI Audio Speech)', text: 'Tap 🔊 to have the app read aloud. Choose Female or Male voice and tune reading speed (0.8×, 1.0×, 1.2×).' },
              { title: '7. Share (📤)', text: 'Copy the chapter link to send to family, Dharma companions, or share across social media.' },
              { title: '8. Offline Reading & Auto-Sync', text: 'All books are stored offline on your device, allowing seamless reading anywhere without requiring internet.' },
              { title: '9. Auto-Scroll (⬇️)', text: 'Hands-free reading: let the text gently scroll downward at your chosen tempo (Very Slow, Slow, Normal, Fast).' },
              { title: '10. Close (✕) & Back', text: 'Tap ✕, the top Back button, or use your phone’s Back gesture to return to the Table of Contents or Library.' },
            ],
          },
        ],
      },
      {
        id: 'ghi-chu-va-trich-dan',
        title: 'Highlighting Quotes & Personal Notes',
        keywords: ['highlight', 'annotation', 'personal notes', 'my quotes', 'save quote'],
        blocks: [
          { type: 'paragraph', text: 'When encountering an inspiring passage in books or PDFs, simply select the text with your finger or mouse. The [ 🔖 Save Quote ] prompt appears instantly:' },
          {
            type: 'bullets',
            items: [
              'Tap “Save Quote”: Instantly store the wisdom teaching into your collection in a single tap.',
              'Tap “✍️ Note”: Add personal reflections or adjust highlight colors.',
              'PDF Text Highlighting: Highlight text directly on PDF pages and save quotes tagged with corresponding page numbers.',
              '“My Quotes” Shelf: Revisit all saved teachings and notes anytime from your profile menu.',
            ],
          },
          { type: 'callout', tone: 'note', title: 'Private & Secure Cloud Sync', text: 'Sign in with Google or Facebook to securely back up all your quotations and reading progress across all your devices.' },
        ],
      },
      {
        id: 'pdf-nghe-va-offline',
        title: 'Voice Narration (TTS) & Offline Saving',
        keywords: ['tts', 'read aloud', 'offline save', 'indexeddb'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Listen Aloud', text: 'Tap 🔊 to activate automated voice narration with adjustable playback speed and natural tone.' },
              { title: 'Auto-Scroll Sync', text: 'Activate auto-scroll to let the page gently advance alongside your recitation.' },
              { title: 'Save for Offline', text: 'Tap “Save Offline” to download the book into local cache for unhindered reading without network connectivity.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'cong-cu-tu-tap',
    icon: '📿',
    title: 'Cultivation Tools & Practice Tracking',
    shortTitle: 'Practice',
    keywords: ['rosary', 'mala beads', 'meditation', 'timer', 'goals', 'heatmap', 'group practice'],
    editorialStatus: 'verified-software',
    introduction: [
      'Comprehensive toolkit for dedicated practitioners: virtual rosary mala, meditation bell timer, lunar observance calendar, and daily practice streaks.',
    ],
    topics: [
      {
        "id": "che-do-le-phat",
        "title": "Buddha Prostrations & Repentance",
        "keywords": [
          "prostrations",
          "repentance",
          "Buddha statues",
          "108 bows",
          "21 bows",
          "practice journal"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose a statue and goal",
                "text": "Open Prostrations & Repentance in Practice. Swipe or use arrows to select one of 14 statues; open its information for the six-part profile, currently in Vietnamese. Choose the target and audio; the target is not a completed count."
              },
              {
                "title": "Begin and count bows",
                "text": "Press Start Prostrations. After each bow, press the counting button at the bottom. Each press adds one bow and optionally plays a bell or wooden fish. The application does not detect body movements."
              },
              {
                "title": "Review before saving",
                "text": "Press Finish to review the count. Adjust the actual number, continue without resetting the count, or leave without saving."
              },
              {
                "title": "Record in the practice journal",
                "text": "Confirm to save the bows and chosen Buddha. A new session starts at zero. Keeping the screen awake depends on device support and state."
              }
            ]
          }
        ]
      },
      {
        "id": "che-do-thanh-tinh",
        "title": "Self-restraint & Wellbeing",
        "keywords": [
          "self restraint",
          "Thanh Tinh",
          "Buddha recitation",
          "mantra",
          "wooden fish",
          "bell"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose a practice",
                "text": "Open Self-restraint & Wellbeing, review progress and select the supported tool you need. Read the instructions and use its check-in, mantra, pause or finish controls."
              },
              {
                "title": "Vows and community practice",
                "text": "Before joining a shared vow, review its content, duration and goal. Check personal status and sharing settings; public community figures are not a copy of offline data on your device."
              }
            ]
          }
        ]
      },
      {
        "id": "cai-dat-nhac-nho-tu-tap",
        "title": "Practice & Lunar Observance Reminders",
        "keywords": [
          "practice reminders",
          "lunar calendar",
          "vegetarian days",
          "Buddhist observances",
          "morning practice",
          "evening practice"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Open reminders",
                "text": "Go to Personal > Application settings > Practice reminders. Enable the lunar or practice reminder groups you need, then choose times and repeating days."
              },
              {
                "title": "Name each practice period",
                "text": "Name morning, evening or custom practice reminders and check their time and enabled state after saving. On iOS, allow notifications when prompted if you wish to receive reminders; review permissions in system Settings > Notifications."
              },
              {
                "title": "Android notification permission",
                "text": "Grant notification permission when you want reminders. If prompted, enable Alarms & reminders in system settings to reduce delays while the device sleeps."
              },
              {
                "title": "After installation or force stop",
                "text": "Open the application at least once after installation or update to restore reminders. After Force stop, reopen it. Battery-saving and background restrictions can delay notifications."
              }
            ]
          }
        ]
      },
      {
        "id": "chep-kinh-tren-app",
        "title": "Sutra Copying in the Application",
        "keywords": [
          "sutra copying",
          "type scripture",
          "draft"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose scripture and prepare",
                "text": "Open Sutra Copying in Practice, choose a supported sutra and chapter, read the preparation guide and begin. Sign in if requested."
              },
              {
                "title": "Type each passage yourself",
                "text": "Type the model passage including Vietnamese accents. Ghost Text shows the model inside the input; otherwise compare with the Scripture Model panel. It follows the active passage and can be collapsed. Ordinary accounts cannot paste or drag text; parenthetical directions need not be copied."
              },
              {
                "title": "Review and save",
                "text": "Review the passage and correct errors. Move on when accepted and check completion messages. Drafts save locally; upload only with Save to system and a successful receipt. Check saving before changing devices or clearing data."
              }
            ]
          }
        ]
      },
      {
        "id": "trang-hat-ao",
        "title": "Virtual Mala — Manual & Automatic Rhythm",
        "keywords": [
          "digital rosary",
          "mala",
          "automatic rhythm",
          "wooden fish",
          "108 beads",
          "30 bpm",
          "40 bpm",
          "60 bpm",
          "80 bpm"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose how to count",
                "text": "Open the mala and use the existing pickers to choose your phrase, beads and goal. In manual mode, tap or swipe after each recitation. In automatic mode, choose a session target and press Start; each audible beat advances one bead."
              },
              {
                "title": "Choose the rhythm",
                "text": "Very slow: 2 seconds per beat (30 bpm); Slow: 1.5 seconds (40 bpm); Moderate: 1 second (60 bpm); Diligent: 0.75 seconds (80 bpm). Choose a comfortable pace for your breathing and recitation."
              },
              {
                "title": "Pause and finish",
                "text": "Choose the session recitation target, with presets up to 10,800 recitations. Press Pause to rest and Resume to continue. At the chosen target, the rhythm stops, three closing bells sound, and the session moves to completion and dedication. Repeated taps do not add extra completed beads."
              }
            ]
          },
          {
            "type": "paragraph",
            "text": "The advanced automatic rhythm invites you to stay deeply attentive to your Buddha name, mantra or chosen sacred phrase. Gently return to the phrase whenever the mind wanders."
          },
          {
            "type": "paragraph",
            "text": "Background audio and haptics depend on device, browser and system audio interruptions. Counting follows actual playback, without adding beads for time spent paused."
          }
        ]
      },
      {
        "id": "so-quan-chieu-ca-nhan",
        "title": "Personal Reflection Journal",
        "keywords": [
          "reflection journal",
          "private diary",
          "good deeds",
          "nickname",
          "body speech mind"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Reflect at the end of the day",
                "text": "Write separately about mistakes you wish to transform and good deeds you have done. Review body, speech and mind sincerely, without judging yourself harshly."
              },
              {
                "title": "Keep it private on this device",
                "text": "Private local storage is the default. Private journal entries are excluded from server synchronization. If saving fails, keep the text and retry before leaving the screen."
              },
              {
                "title": "Choose a community nickname",
                "text": "You can change your nickname. Public posts display this nickname rather than your account name, email or personal avatar. Only the repentance or good-deed section you explicitly choose and confirm is sent."
              }
            ]
          }
        ]
      },
      {
        "id": "cong-dong-sam-hoi-tuy-hy",
        "title": "Community Repentance & Rejoicing in Merit",
        "keywords": [
          "community",
          "repentance",
          "rejoicing",
          "prayer",
          "encouragement",
          "my posts"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose the feed",
                "text": "Repentance shows shared confessions; Good Deeds shows wholesome actions. My Posts lists your own posts and the prayers or rejoicing they have received. Load more to see the next page."
              },
              {
                "title": "Send one prepared message",
                "text": "Choose a prayer or praise template, then confirm. Free-text comments are not available. Each account can encourage or rejoice once per post, including across nickname changes or devices. The submitted state shows that your interaction has been recorded."
              },
              {
                "title": "Share or remove your post",
                "text": "Read the confirmation before sharing. Posts are public, so avoid including your own or anyone else’s identifying details. You can confirm removal of your own post from My Posts; the remaining private journal is not shared."
              }
            ]
          },
          {
            "type": "paragraph",
            "text": "Joyfully praising the good deeds of others brings a full and equal share of their great merit."
          }
        ]
      },
      {
        "id": "khoa-le-hang-ngay",
        "title": "Daily Practice Routines",
        "keywords": [
          "daily routine",
          "prostrations",
          "meditation",
          "mala",
          "custom dedication"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Create your routine",
                "text": "On the main Practice screen, open Suggested routine → My routines to create a Morning or Evening Routine, or choose your own name. Add, remove and reorder prostration, meditation, mala and dedication steps; set counts, duration and recitation phrase."
              },
              {
                "title": "Choose and edit a dedication",
                "text": "Templates come from the application’s bundled Great Compassion Mantra ritual, Shurangama Mantra ritual and Ksitigarbha Bodhisattva Sutra. Edit your own copy, add the names of loved ones, or write a new dedication. The original scripture remains unchanged."
              },
              {
                "title": "Follow the steps",
                "text": "Start the routine to use the existing practice tools in order. Follow the step indicator, pause when necessary or choose to move on. Confirm after reading the dedication. Skipping a step does not mean its target was completed."
              }
            ]
          }
        ]
      },
      {
        "id": "dong-bo-ca-nhan-48-gio",
        "title": "Personal Saving & 48-hour Synchronization",
        "keywords": [
          "48 hours",
          "personal sync",
          "dedication",
          "restore routines",
          "data savings"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Routines, custom dedications and your nickname save immediately on this device. Syncable personal changes are uploaded only after 48 hours since the last successful upload; the first window starts with the first local change. No changes means no synchronization request."
          },
          {
            "type": "paragraph",
            "text": "If the application is closed or offline, uploading waits until it is active and online again. Network failures preserve local data. Private journal entries stay on the device. Explicit community posts and prayers are sent immediately rather than waiting 48 hours."
          },
          {
            "type": "callout",
            "tone": "note",
            "title": "When changing devices",
            "text": "Recent edits within the 48-hour window may not yet be on the server. Restore explicitly and review which version to keep; unsynchronized changes are not silently overwritten when a conflict occurs."
          }
        ]
      },
      {
        id: 'toa-thien-hen-gio',
        title: 'Sitting Meditation & Mindfulness Bell',
        keywords: ['meditation timer', 'mindfulness bell', 'sitting practice'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Select Duration', text: 'Choose presets (15m, 30m, 45m, 60m) or customize according to your sitting schedule.' },
              { title: 'Preparation Buffer (30s)', text: 'A gentle 30-second countdown allows you to settle your posture, relax your body, and calm your breath before timing starts.' },
              { title: 'Opening & Closing Bells', text: 'A resonant temple bell rings to commence and conclude your meditation, with optional ambient zen melodies throughout.' },
              { title: 'Accurate Time Logging', text: 'Completed meditation periods are recorded precisely into your cultivation history.' },
            ],
          },
        ],
      },
      {
        id: 'goi-y-va-tien-do',
        title: 'Lunar Observance, Practice Streaks & Heatmap',
        keywords: ['lunar calendar', 'vegetarian days', 'streak', 'heatmap', 'merit dedication'],
        blocks: [
          {
            type: 'cards',
            items: [
              { title: 'Lunar & Vegetarian Alerts', text: 'Integrated lunar calendar highlights Full Moon, New Moon, vegetarian days (Thap Trai), and Buddhist feast days.' },
              { title: 'Practice Streak Heatmap', text: 'Visually monitor your daily consistency through continuous streaks and a GitHub-style activity heatmap.' },
              { title: 'Collective Chanting Events', text: 'Join group practice vows with fellow practitioners to dedicate collective wholesome merits.' },
              { title: 'Merit Dedication Card', text: 'Generate an elegant dedication card displaying your daily sutras and counts to preserve or share.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'phap-thoai',
    icon: '🎧',
    title: 'Dharma Talks & Audio Lectures',
    shortTitle: 'Dharma Talks',
    keywords: ['audio', 'persistent player', 'favorites', 'listen later', 'speaker', 'duration'],
    editorialStatus: 'verified-software',
    introduction: [
      'Rich repository of recorded Dharma lectures by venerable masters, supporting persistent background playback and offline audio.',
    ],
    topics: [
      {
        id: 'dieu-khien-phap-thoai',
        title: 'Audio Player & Convenient Controls',
        keywords: ['mini player', 'rewind 10s', 'forward 30s', 'media session', 'lockscreen'],
        blocks: [
          {
            type: 'bullets',
            items: [
              'Continuous Background Playback: As you browse between Books, Practice, or Home, audio keeps playing smoothly via the mini-player.',
              'Auto-Resume Position: When returning to a lecture, playback automatically resumes right from the exact minute you left off.',
              'Quick Seek & Shortcuts: Dedicated buttons for 10s rewind and 30s advance. On computers, press Space to Pause/Play, M to Mute.',
              'Lock Screen Controls: Seamlessly control playback and skip tracks from Bluetooth headphones and lock-screen media controls.',
            ],
          },
        ],
      },
      {
        id: 'luu-va-loc-phap-thoai',
        title: 'Personal Audio Library & Offline Downloads',
        keywords: ['favorites', 'listen later', 'recent', 'speaker', 'duration'],
        blocks: [
          {
            type: 'cards',
            items: [
              { title: 'Favorites (❤️)', text: 'Tap the heart icon to save talks into Favorites for easy listening anytime.' },
              { title: 'Listen Later (🔖)', text: 'Bookmark lectures you wish to explore during upcoming quiet hours.' },
              { title: 'Recently Played', text: 'Automatically keeps track of recently heard lectures so you never lose your spot.' },
              { title: 'Smart Search & Filters', text: 'Search by Venerable Speaker, Theme (Karma, Impermanence, Meditation...) or filter by duration.' },
              { title: 'Offline Audio Downloads', text: 'Save lecture tracks directly to local storage to listen while commuting, traveling, or off the grid.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'tai-khoan-dong-bo',
    icon: '☁️',
    title: 'Account Sync & Cloud Storage',
    shortTitle: 'Cloud Sync',
    keywords: ['google login', 'cloud sync', 'backup', 'facebook login'],
    editorialStatus: 'verified-software',
    introduction: [
      'Signing in preserves your practice history, notes, and bookmarks across multiple devices.',
    ],
    topics: [
      {
        "id": "an-toan-cong-dong",
        "title": "Report, Block & Unblock",
        "keywords": [
          "report",
          "block",
          "unblock",
          "community",
          "moderation"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Report content",
                "text": "Where a comment or community profile has an action menu, choose Report, select a reason and submit. Sign-in and a network are required; only a success confirmation means the report was received. Pending content may not be public yet."
              },
              {
                "title": "Block or unblock",
                "text": "Choose Block user to hide that person’s content for your account. In Personal, open Blocked users and confirm Unblock to see it again. This does not delete their comments."
              },
              {
                "title": "Moderation permissions",
                "text": "Users submit reports and manage their own block lists. Moderation queues and approve/hide decisions belong to administrators, not automatically to contributors. If the service fails, preserve the action and try again later."
              }
            ]
          }
        ]
      },
      {
        "id": "xoa-tai-khoan",
        "title": "Delete an Account",
        "keywords": [
          "delete account",
          "Apple",
          "confirmation code",
          "data"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Confirm the account",
                "text": "Sign in to the account you want to delete and open Personal > Delete account. Read the warning and enter the displayed confirmation code. This is not ordinary sign-out."
              },
              {
                "title": "Complete the request",
                "text": "A network is required. An Apple-linked account may require Apple reauthentication. Wait for successful confirmation; an error or cancelled authentication does not mean deletion succeeded."
              },
              {
                "title": "Check device data",
                "text": "Server account deletion does not replace clearing downloads, exports or copies on other devices. If you cannot access the account, contact support for verification; never send passwords or login codes."
              }
            ]
          }
        ]
      },
      {
        "id": "ket-noi-facebook-quan-tri",
        "title": "Connect Facebook & Import Posts for Administrators",
        "keywords": [
          "Facebook connect",
          "Meta app review",
          "user_posts",
          "import source",
          "ledger",
          "reconnect"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Connect the intended account",
                "text": "In administration settings, connect Facebook and confirm the configured source. Google and Facebook accounts do not automatically link by email."
              },
              {
                "title": "Review the import ledger",
                "text": "The ledger shows discovered, imported, failed, pending-review or disconnected posts. Imported material still follows the existing editorial workflow."
              },
              {
                "title": "Reconnect when necessary",
                "text": "When permission expires or is revoked, reconnect is requested and scheduled import stops safely. Full access requires the necessary Meta permissions including user_posts Advanced Access; without approval the importer reports missing permission and does not scrape."
              }
            ]
          }
        ]
      },
      {
        id: 'dang-nhap-va-dong-bo',
        title: 'Sign In & Synchronization',
        keywords: ['google login', 'facebook login', 'practice history', 'notes', 'reading progress'],
        blocks: [
          { type: 'paragraph', text: 'Sign in with Google or Facebook so your practice journal, reading progress, and personal annotations remain securely linked to your account.' },
          { type: 'callout', tone: 'warning', title: 'Device-Only Cache Notice', text: 'Locally cached PDFs and unsynced counts reside on your device until connected. Please connect to the internet before clearing browser data or changing phones.' },
        ],
      },
    ],
  },
];

export const enDoctrinalGuideSections: GuideSection[] = [
  {
    id: 'huong-dan-nguoi-moi',
    icon: '🌱',
    title: 'Beginner’s 4-Stage Guide to Buddhist Practice',
    shortTitle: 'Beginners',
    keywords: ['beginners', 'starting practice', 'four stages', 'karma', 'reincarnation', 'great compassion mantra', 'earth store sutra'],
    editorialStatus: 'verified',
    introduction: [
      'Beginning Buddhist study and daily cultivation can feel overwhelming with countless scriptures, commentaries, and traditions. A grounded, step-by-step path rooted in Right View helps you build unshakeable faith, purify karmic hindrances, and cultivate tangible peace in daily living.',
      'Below is the 4-stage foundation tailored for beginners: from understanding the reality of cause and effect through books, establishing daily mantra recitation, deepening wisdom through ancestral commentaries, to dedicating oneself to a lifelong steadfast practice.',
    ],
    topics: [
      {
        id: 'giai-doan-1-doc-sach-nhan-qua-luan-hoi',
        title: 'Stage 1 — Understanding the Law of Karma & Reincarnation',
        keywords: ['stage 1', 'karma books', 'retribution in this life', 'many lives many times', 'cause and effect'],
        blocks: [
          {
            type: 'callout',
            tone: 'note',
            title: 'First Foundation: Developing Right Faith in the Law of Karma',
            text: 'The Buddha taught: “To know your past causes, look at what you receive in this life; to know your future fruits, look at what you sow in this life.” For newcomers, theoretical abstractions are secondary. First, examine modern real-life karmic accounts to awaken profound faith in karma and rebirth, naturally leading to refraining from unwholesome deeds and cultivating goodness.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Read the Complete “Karmic Retributions in Modern Times” Series (Vol 1–8)',
                text: 'Chronicles compiled by Upasaka Guo Qing under Venerable Master Miao Fa. Real modern accounts reveal the hidden karmic roots behind incurable illnesses, family discord, and sudden bankruptcy—tracing back to killing, abortion, sexual misconduct, theft, or filial impiety. Reading this strikes the heart and inspires a firm resolve to halt all evil actions.',
              },
              {
                title: 'Read “The Mission of Guiding the Departed” (Sứ Mệnh Độ Vong)',
                text: 'Offers compassionate insight into the unseen realm and consciousness after death. Understand the plight of aborted spirits and karmic creditors, transforming baseless fear or superstition into genuine compassion through prayer, chanting, and merit dedication.',
              },
              {
                title: 'Read “Many Lives, Many Times” (Muôn Kiếp Nhân Sinh - Nguyen Phong)',
                text: 'A profound exploration of past-life memories across ancient civilizations, detailing the cosmic mechanics of reincarnation, collective karma, and the transformative power of unconditional love.',
              },
              {
                title: 'Listen to Audio Lectures on Karma & the Afterlife',
                text: 'Utilize quiet hours or commutes to listen to cautionary karmic lectures and near-death experiences in the Dharma Talks section, deepening confidence in the unseen moral order.',
              },
            ],
          },
          {
            type: 'bullets',
            title: 'Goals Achieved After Stage 1:',
            items: [
              'Eradicating doubts regarding karma, rebirth, and the unseen moral law.',
              'Adopting a vegetarian diet, reducing harm to sentient beings, liberating captive lives, honoring parents, and speaking gently.',
              'Deeply realizing the fleeting nature of life and cultivating a sincere yearning for Dharma practice.',
            ],
          },
        ],
      },
      {
        id: 'giai-doan-2-hang-ngay-tri-tung-chu-dai-bi',
        title: 'Stage 2 — Daily Recitation of the Great Compassion Mantra',
        keywords: ['stage 2', 'daily practice', 'great compassion mantra', 'earth store sutra', 'purifying karma'],
        blocks: [
          {
            type: 'callout',
            tone: 'note',
            title: 'Commencing Practical Cultivation: The Power of Great Compassion Dharani',
            text: 'The Great Compassion Dharani is the sacred heart mantra of Bodhisattva Avalokiteshvara, possessing unfathomable power to dissolve karmic obstacles, heal grievances, and shield body and mind. Regular recitation quickly settles scattered thoughts, dispels anxiety, and brings profound inner tranquility.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Daily Recitation in the Practice Section',
                text: 'Commit to reciting the Great Compassion Mantra at least 5, 7, 21, or 108 times daily. Use the built-in wooden fish sound and mala beads to sustain rhythmic focus.',
              },
              {
                title: 'Study Master Hsuan Hua’s Commentary on the Earth Store Sutra',
                text: 'Listen to Venerable Master Hsuan Hua’s clear, accessible explanation of the Earth Store Sutra, clarifying filial piety, karmic retribution, and the immense vows of Ksitigarbha Bodhisattva.',
              },
            ],
          },
        ],
      },
      {
        id: 'giai-doan-3-sau-6-thang-nghe-kinh-phap-hoa',
        title: 'Stage 3 — Deepening Wisdom with the Lotus Sutra Commentary',
        keywords: ['stage 3', 'lotus sutra', 'hsuan hua', 'wisdom', 'buddha nature'],
        blocks: [
          {
            type: 'paragraph',
            text: 'After steady cultivation for 6 months to a year, listen to Master Hsuan Hua’s commentary on the Lotus Sutra (Saddharma Pundarika Sutra)—the King of Sutras that reveals all sentient beings possess inherent Buddha-nature.',
          },
        ],
      },
      {
        id: 'giai-doan-4-dinh-hinh-phap-mon-chuyen-tu',
        title: 'Stage 4 — Establishing a Steadfast Lifelong Practice',
        keywords: ['stage 4', 'lifelong practice', 'pure land', 'nembutsu', 'chan', 'vows'],
        blocks: [
          {
            type: 'paragraph',
            text: 'Ground your practice firmly in a specific Dharma gate—whether Pure Land mindfulness of Amitabha Buddha, Shurangama Mantra recitation, or Earth Store repentance—persisting daily until liberation.',
          },
        ],
      },
    ],
  },
  {
    id: 'huong-dan-tung-kinh',
    icon: '📖',
    title: 'Guide to Sutra Chanting',
    shortTitle: 'Sutra Chanting',
    keywords: ['sutra chanting', 'morning practice', 'evening practice', 'pregnancy', 'dreams', 'illness', 'earth store sutra'],
    editorialStatus: 'verified',
    introduction: [
      'Chanting sutras involves reciting the Buddha’s sacred words with reverent mindfulness, nurturing understanding, expanding wisdom, and planting wholesome seeds with the Three Jewels.',
    ],
    topics: [
      {
        id: 'thoi-gian-tung-kinh',
        title: 'Ideal Times for Sutra Chanting',
        keywords: ['chanting schedule', 'morning', 'evening', 'vegetarian days'],
        blocks: [
          {
            type: 'cards',
            items: [
              {
                title: 'Daily Practice is Best',
                text: 'If daily recitation is difficult, practice once a week or on lunar observance days (1st, 8th, 14th, 15th, 23rd, 30th of the lunar month) while keeping precepts.',
              },
              {
                title: 'Early Morning or Before Sleep',
                text: 'The mind is clearest at these hours. Morning chanting inspires pure intentions for the day; evening chanting purifies regrets and calms the spirit.',
              },
            ],
          },
        ],
      },
      {
        id: 'hoan-canh-nen-tung-kinh-dia-tang',
        title: 'Occasions for Chanting the Earth Store Sutra',
        keywords: ['earth store sutra', 'pregnancy', 'nightmares', 'departed loved ones', 'serious illness', 'adversity'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'During Pregnancy or Before Childbirth', text: 'Recite the Earth Store Sutra and chant Ksitigarbha’s holy name 10,000 times to dispel ancestral karma and bless the newborn with peaceful longevity.' },
              { title: 'Nightmares or Seeing the Departed in Dreams', text: 'Often indicates departed relatives seeking wholesome merits. Dedicate 3 to 7 recitations of the Earth Store Sutra for their liberation.' },
              { title: 'Severe Family Illness', text: 'Chanting on behalf of an ailing person or sponsoring sutra distributions helps eradicate weighty karma and ease distress.' },
              { title: 'Within 49 Days of a Passing', text: 'During the 49-day bardo state, dedicate sincere recitations to assist the departed soul into a peaceful rebirth.' },
              { title: 'Facing Hardships & Major Obstacles', text: 'Commit to a 7-day, 21-day, or 49-day recitation vow with 1,000 daily repetitions of Ksitigarbha Bodhisattva’s sacred name.' },
            ],
          },
        ],
      },
      {
        id: 'luu-y-khi-tung-kinh',
        title: 'Mindful Guidelines for Chanting',
        keywords: ['guidelines', 'sincerity', 'reverence', 'dedication'],
        blocks: [
          {
            type: 'bullets',
            title: 'Essential points to remember:',
            items: [
              'Chant clearly, steadily, and reverently—depth of mindfulness matters far more than speed.',
              'An altar is not strictly required—any clean, quiet, and respectful space is suitable.',
              'In public or crowded places, recite silently in your heart.',
              'Cleanse your hands, rinse your mouth, and dress modestly before opening the scriptures.',
              'Always conclude by dedicating all accumulated merits to all sentient beings.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'huong-dan-tri-chu',
    icon: '📿',
    title: 'Guide to Mantra Recitation (Dharani)',
    shortTitle: 'Mantra',
    keywords: ['mantra', 'dharani', 'recitation', 'pure land', 'great compassion mantra', 'shurangama mantra'],
    editorialStatus: 'verified',
    introduction: [
      'A Mantra (Dharani) embodies the mystic syllables of Buddhas and Bodhisattvas, functioning as an armor for body and mind to eliminate karma and awaken inner wisdom.',
    ],
    topics: [
      {
        id: 'phan-biet-tri-va-niem-chu',
        title: 'Reciting from Memory vs. Reading Mantras',
        keywords: ['memorization', 'mindful chanting'],
        blocks: [
          {
            type: 'cards',
            items: [
              { title: 'Holding Mantras (Trì Chú)', text: 'Reciting fluently from memory in continuous cycles. This represents formal core cultivation.' },
              { title: 'Reading Mantras (Niệm Chú)', text: 'Chanting while reading text. Sincere devotion still yields immense, inconceivable merit.' },
            ],
          },
        ],
      },
      {
        id: 'tri-chu-va-niem-phat-ket-hop',
        title: 'Combining Mantra Recitation with Buddha Mindfulness',
        keywords: ['primary practice', 'supportive practice', 'pure land', 'amitabha'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Buddha Mindfulness as Primary Practice', text: 'If aspiring for Western Pure Land, recite "Namo Amitabha Buddha" as your core foundation.' },
              { title: 'Mantras as Supportive Cultivation', text: 'Reciting the Great Compassion or Shurangama Mantra helps dissolve karmic obstructions and stabilizes the mind.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'tho-tuong-tai-gia',
    icon: '🪔',
    title: 'Setting Up an Altar & Sacred Statues at Home',
    shortTitle: 'Altar Setup',
    keywords: ['buddhist altar', 'statues', 'ksitigarbha', 'respectful placement', 'home worship'],
    editorialStatus: 'verified',
    introduction: [
      'Setting up a Buddhist altar at home can be done sincerely by yourself. Direct devotion and genuine respect yield pure, complete merit for the entire household.',
    ],
    topics: [
      {
        id: 'buoc-1-tam-tuong-khi-nhan-ve',
        title: 'Step 1 — Cleansing the Sacred Statue',
        keywords: ['cleansing statue', 'pure water', 'respectful handling'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Prepare Dedicated Utensils', text: 'Prepare pure warm water, fragrant herbs/cleansing essence, a dedicated clean basin, and a fresh clean towel.' },
              { title: 'Receive with Both Hands', text: 'Hold the sacred statue with both hands and reverent mind. Gently cleanse the image and dry it with the dedicated cloth.' },
              { title: 'Store Utensils Respectfully', text: 'Keep these utensils in a clean place exclusively for future statue cleanings.' },
            ],
          },
        ],
      },
      {
        id: 'buoc-2-an-vi-tuong-va-doc-bai-thinh',
        title: 'Step 2 — Enshrining the Statue & Sincere Invocation',
        keywords: ['enshrining', 'altar placement', 'prayers'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Altar Placement', text: 'Place the statue on a clean, elevated altar. If sharing an altar with ancestors or guardian deities, the Buddha/Bodhisattva must be elevated higher.' },
              { title: 'Chant Great Compassion Mantra', text: 'Recite 7 to 21 recitations of the Great Compassion Mantra with pure devotion.' },
              { title: 'Read the Invocation Prayer (3 Times)', text: 'Sincerely recite the prayer inviting the Bodhisattva’s compassionate presence to guide your family toward wholesome virtues.' },
              { title: '7 Days of Dedicated Sutra Recitation', text: 'For the next 7 days, recite the Earth Store Sutra or Amitabha Sutra once daily to consecrate the home altar.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'thuc-hanh-hang-ngay',
    icon: '📋',
    title: 'Daily Cultivation Routine & Living Mindfully',
    shortTitle: 'Daily Practice',
    keywords: ['daily routine', 'morning vow', 'daytime virtue', 'evening repentance', 'core principles'],
    editorialStatus: 'verified',
    introduction: [
      'A regular, mindful daily routine steadily transforms karmic tendencies and establishes enduring peace for yourself and your family.',
    ],
    topics: [
      {
        id: 'khung-thoi-khoa-trong-ngay',
        title: 'Daily Practice Schedule',
        keywords: ['morning', 'daytime', 'evening', 'repentance', 'merit dedication'],
        blocks: [
          {
            type: 'steps',
            items: [
              {
                title: 'Morning — Awakening Wholesome Intentions',
                text: 'Upon waking, spend 5 minutes reciting holy names and renew your vow: "Today I resolve to do good, refrain from evil, help sentient beings, and maintain a pure heart." Then chant your morning session.',
              },
              {
                title: 'Daytime — Practicing Kindness & Silent Chanting',
                text: 'Help others in small, practical ways. Use idle moments while walking, commuting, or cooking to silently repeat the Buddha’s name.',
              },
              {
                title: 'Evening — Repentance & Merit Dedication',
                text: 'Before sleep, reflect upon the day. Acknowledge mistakes with sincere repentance, and dedicate all day’s merits to all living beings.',
              },
            ],
          },
        ],
      },
      {
        id: 'nguyen-tac-cot-loi',
        title: 'Core Cultivation Principles',
        keywords: ['consistency', 'sincerity', 'five precepts', 'patience'],
        blocks: [
          {
            type: 'bullets',
            items: [
              'Consistency is paramount — 15 mindful minutes every day is far superior to 3 hours once a week.',
              'Sincere heart outweighs mere form — 5 minutes of focused chanting surpasses an hour of distracted recitation.',
              'Ethical foundation: Uphold the Five Precepts (no killing, stealing, sexual misconduct, lying, or intoxicants).',
              'Patience and perseverance — Dharma cultivation is a lifelong cultivation, not a rapid pursuit of results.',
            ],
          },
        ],
      },
    ],
  },
  {
    "id": "bo-thi-may-nghe-phap",
    "icon": "📻",
    "title": "Dharma Giving — Offering Recitation Players",
    "shortTitle": "Dharma Giving",
    "keywords": [
      "Dharma giving",
      "recitation player",
      "memory card",
      "MicroSD",
      "FAT32",
      "spirits"
    ],
    "editorialStatus": "verified",
    "introduction": [
      "“Dharma giving surpasses all giving” (Dhammapada, verse 354). Offering recitation players shares teachings and Buddha-name recitation with a compassionate intention."
    ],
    "topics": [
      {
        "id": "y-nghia-va-cong-duc-phap-thi-may-nghe-phap",
        "title": "Meaning & Intention of Offering Recitation Players",
        "keywords": [
          "Dharma giving",
          "merit",
          "Buddha recitation"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Offering a Dharma or Buddha-recitation player is a way to share the teachings. Approach it with compassion, without fear, personal gain or requests for wealth from spirits."
          }
        ]
      },
      {
        "id": "chuan-bi-may-va-the-nho-nghe-phap",
        "title": "Prepare a Player & Memory Card",
        "keywords": [
          "memory card",
          "4GB",
          "FAT32",
          "MicroSD"
        ],
        "blocks": [
          {
            "type": "callout",
            "tone": "note",
            "title": "Choose a player with a memory-card slot",
            "text": "Some inexpensive players contain fixed recordings and cannot accept new files. Choose a model with a MicroSD/TF slot or USB input that supports copying your selected audio."
          },
          {
            "type": "steps",
            "items": [
              {
                "title": "Choose the player",
                "text": "Check the supported audio format, memory capacity, power supply and intended indoor or outdoor use."
              },
              {
                "title": "Prepare a 4GB MicroSD card",
                "text": "The existing guide uses a 4GB MicroSD card formatted as FAT32. Check compatibility with the chosen player before copying files."
              },
              {
                "title": "Set repeat playback",
                "text": "Insert the card and use Mode or Repeat to choose one-track or whole-list repetition, following the device instructions."
              }
            ]
          }
        ]
      },
      {
        "id": "vi-tri-dat-may-va-cach-che-chan-ngoai-troi",
        "title": "Placement & Weather Protection",
        "keywords": [
          "outdoor",
          "weather",
          "cemetery",
          "volume"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Choose a suitable location only with the permission of the site’s owner or manager. Keep the player dry and ventilated, protect it appropriately for its rated use, and check it periodically."
          },
          {
            "type": "paragraph",
            "text": "Secure it safely and keep the sound gentle, audible within about 3–5 metres as suggested in the original guide. Respect nearby residents and visitors; do not obstruct walkways or disturb the site."
          }
        ]
      },
      {
        "id": "tam-luong-va-nghi-thuc-khan-nguyen",
        "title": "Compassionate Intention & Dedication",
        "keywords": [
          "compassion",
          "prayer",
          "dedication"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Keep a sincere, compassionate intention rather than seeking personal gain. Dedicate the merit of your daily practice to the beings you wish to benefit."
          },
          {
            "type": "paragraph",
            "text": "Check the battery, clean the case and recharge when necessary."
          }
        ]
      },
      {
        "id": "tai-ve-cac-bai-phap-tuyen-chon-cho-the-nho",
        "title": "Download the Selected Audio for a Memory Card",
        "keywords": [
          "download",
          "memory card",
          "Google Drive",
          "extract"
        ],
        "blocks": [
          {
            "type": "bullets",
            "title": "Original titles in the selected archive",
            "items": [
              "1. Kinh Địa Tạng Bồ Tát Bổn Nguyện (Diễn đọc trọn bộ) — bộ kinh căn bản độ âm thù thắng.",
              "2. Thần Chú Tôn Thắng Phật Đảnh Đà La Ni (21 biến) — oai lực đệ nhất tiêu trừ ác nghiệp, cứu bạt địa ngục.",
              "3. Bài khai thị cho Hương Linh, Vong Linh (Cửu Huyền Thất Tổ).",
              "4. Lời khai thị cho người sắp lâm chung.",
              "5. Nam Mô Địa Tạng Vương Bồ Tát (Thầy Thích Trí Thoát tụng).",
              "6. Kinh Phổ Môn Diễn Đọc (Quán Thế Âm Bồ Tát cứu khổ cứu nạn).",
              "7. Nam Mô Quan Thế Âm Bồ Tát.",
              "8. Kinh A Di Đà diễn đọc.",
              "9. Nam Mô A Di Đà Phật (bản mới trang nghiêm thanh tịnh).",
              "10. Kinh Đại Thừa Vô Lượng Thọ (HT. Thích Đức Niệm dịch).",
              "11. Tán Thán Phật A Di Đà Và Cõi Cực Lạc.",
              "12. Kinh Quán Vô Lượng Thọ Phật.",
              "13. Quê Hương Cực Lạc (Hòa thượng Tuyên Hóa khai thị).",
              "14. Kinh Nghiệp Báo Sai Biệt.",
              "15. Kinh Nhân Quả Ba Đời.",
              "16. Diễn đọc Kinh Thập Thiện Nghiệp Đạo.",
              "17. Kinh Dược Sư Lưu Ly Quang Như Lai Bổn Nguyện Công Đức.",
              "18. Nam Mô Dược Sư Lưu Ly Quang Vương Phật (Thầy Thích Trí Thoát tụng).",
              "19. Kinh Hoa Nghiêm — Phẩm Phổ Hiền Hạnh Nguyện.",
              "20. Phẩm 5: Diệt Trừ Nghiệp Chướng (Kinh Ánh Sáng Hoàng Kim).",
              "21. Kinh Đại Bi Tâm Đà La Ni.",
              "22. Chú Đại Bi tiếng Phạn 21 biến (Quang Từ).",
              "23. Kinh Đại Thừa Trang Nghiêm Bảo Vương.",
              "24. Om Mani Padme Hum (Lục Tự Đại Minh Chú).",
              "25. Kinh Phật Đảnh Tôn Thắng Đà Ra Ni.",
              "26. Kinh Đại Thừa Công Đức Tạo Tượng Phật và Phát Bồ Đề Tâm Văn.",
              "27. Kinh Phước Báo Của Tạo Lập Hình Tượng Phật.",
              "28. Kinh Quán Thế Âm Bồ Tát Thọ Ký.",
              "29. Diễn đọc Phật Thuyết Kinh Từ Thị Bồ Tát Đại Thành Phật."
            ]
          },
          {
            "type": "steps",
            "items": [
              {
                "title": "Download and extract",
                "text": "Open the author’s Google Drive archive below and download it to a computer or phone. Extract the archive to obtain its MP3 files."
              },
              {
                "title": "Copy to the card",
                "text": "Format the compatible 4GB card as FAT32 and copy the extracted MP3 files to the card’s root folder. Insert it in the player and check playback."
              },
              {
                "title": "Ask for help if needed",
                "text": "A phone or computer shop can help download, extract and copy the files. Share the archive link rather than account credentials."
              }
            ]
          },
          {
            "type": "link",
            "href": "https://drive.google.com/file/d/1QSNeYvzkTMsNorQ_23b3W1TIYrQekYeH/view?usp=sharing",
            "externalActions": true,
            "label": "Download the selected Dharma audio archive",
            "text": "The author’s existing Google Drive archive; download and extract the files before copying them to the card.",
            "buttonLabel": "Open Google Drive"
          }
        ]
      }
    ]
  },
  {
    id: 'gioi-thieu-tac-gia',
    icon: '👤',
    title: 'About the Author & Purpose',
    shortTitle: 'Author Info',
    keywords: ['quang tu', 'ngo quang tu', 'author', 'lay practitioner', 'pure land', 'dharma sharing'],
    editorialStatus: 'verified',
    introduction: [],
    topics: [
      {
        id: 'tieu-su-quang-tu',
        title: 'Lay Practitioner Ngo Quang Tu & Vow of Service',
        keywords: ['quang tu', 'biography', 'online monastery', 'free dharma'],
        blocks: [
          {
            type: 'paragraph',
            text: "I am the lay practitioner Ngộ Quang Từ, usually known as Quang Từ, a child of the Buddha with a deep connection to the Dharma. In my life I have faced many upheavals, adversities and trials that once seemed impossible to overcome. In those dark and difficult moments, my fortunate encounter with the wondrous Dharma helped me gradually understand the profound truths taught by the Buddha, especially an unshakable faith in the law of karma and its consequences. Through years of personal reflection and practice, I have come to see this encounter not as a coincidence within this life, but as the continuation of wholesome roots and connections cultivated over countless past lives.",
          },
          {
            type: 'paragraph',
            text: "On my path of Buddhist learning and practice, I always hold deep gratitude for the boundless compassion of Kṣitigarbha Bodhisattva of the Great Vow and Avalokiteśvara Bodhisattva of Great Compassion. They have sheltered, illuminated and guided me through difficult times, helping me transform my heart, resolve grievances and rise again after setbacks. From sincere gratitude to the Three Jewels and the great Bodhisattvas, I have made a heartfelt vow to dedicate this humble body and mind to sharing the true Dharma, spreading the light of awakening and the precious teachings of the Buddhas and patriarchs, and nurturing wholesome connections for those seeking a path beyond suffering.",
          },
          {
            type: 'paragraph',
            text: "I previously had the good fortune to help share the Dharma on Ms. Thạch Mỹ Nghi’s Ngọc Lịch Bửu Phiêu page, sharing lessons on karma, the consequences of good and harmful actions, filial devotion, and practical ways to transform suffering in family and social life. During my dedicated study and spiritual practice, I have had deeply meaningful spiritual experiences that have strengthened my faith in karmic rebirth and the existence of unseen realms within the Dharma realm.",
          },
          {
            type: 'paragraph',
            text: "Understanding that the demands and temptations of the digital age can draw people into worries, status and gain, leaving them anxious, lonely and lost, I devoted my efforts to creating the Tu tập Phật pháp application. It is designed as a dignified, peaceful online practice space where anyone, however busy or far from a temple, can use a phone to practice, bow to the Buddha, recite the Buddha’s name, meditate, copy sutras and listen to Dharma teachings. The application is offered completely free of charge in a spirit of selfless service, with the wish to help people trust deeply in karma, abandon harmful actions, cultivate good deeds, transform karmic tendencies and rediscover inner peace.",
          },
          {
            type: 'paragraph',
            text: "For the Tu tập Phật pháp application to come into being, develop and serve Buddhist practitioners as it does today, I offer my deepest and most sincere gratitude to my wife, Ms. Ôn Nhật Nga, who has stood beside me with understanding, sacrifice and wholehearted support throughout its creation; Mr. Nguyễn Anh Tuấn, Director of Công ty Cổ phần SMOB - SMOB Joint Stock Company, for his dedicated technical expertise and sponsorship of application distribution infrastructure, helping it operate smoothly and reliably on Apple devices (iOS/macOS/iPadOS); Quang Chiến, for his devoted help in building and operating the backend server system and keeping the infrastructure available and secure; Đỗ Chân Đức, for generously providing the rights to include the two valuable works “Sứ Mệnh Độ Vong” and “Sứ Mệnh Thầy Pháp” in the application’s library; and the entire Buddhist community and fellow practitioners near and far who have enthusiastically helped test for errors and contributed valuable feedback during development. I dedicate all merit from creating this application to all beings throughout the Dharma realm, that they may soon enter deeply into the Buddha’s teachings, purify karmic obstacles and become adorned with merit and wisdom. May you and your families enjoy peace in body and mind, auspicious conditions, steadfast bodhicitta and fulfillment in diligent practice on the path to liberation!",
          },
          {
            type: 'paragraph',
            text: "For questions about the application or the content shared within it, you may contact me directly through the Facebook account or Messenger link below. Thank you sincerely for visiting and accompanying the Tu tập Phật pháp application.",
          },
          {
            type: 'link',
            href: 'https://m.me/tranan.buhd',
            label: 'Message via Messenger',
            text: 'Connect or ask questions directly via Messenger (m.me/tranan.buhd)',
          },
          {
            type: 'link',
            href: 'https://www.facebook.com/tranan.buhd/',
            label: 'Personal Facebook Page',
            text: 'Visit Quang Tu’s Facebook profile (facebook.com/tranan.buhd)',
          },
        ],
      },
    ],
  },
  {
    id: 'hoi-dap-thuong-gap',
    icon: '❓',
    title: 'Frequently Asked Questions (FAQ)',
    shortTitle: 'Q & A',
    keywords: ['faq', 'working hours', 'menstruation', 'no altar', 'browser data', 'computer'],
    editorialStatus: 'verified',
    introduction: ['Quick guidance on common questions regarding daily practice at home and using the app.'],
    topics: [],
    faqs: [
      {
        id: 'faq-ban-di-lam-tu-luc-nao',
        question: 'I work full-time all day. When is the best time to practice?',
        keywords: ['busy', 'work schedule', 'morning', 'evening'],
        answer: ['Select a time slot you can maintain consistently: before leaving for work, after returning home, or during a quiet evening break. A focused 5–15 minute session daily is far more sustainable than irregular marathon sessions.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-phu-nu-toi-ngay',
        question: 'Can women chant sutras or light altar incense during menstruation?',
        keywords: ['menstruation', 'incense', 'altar', 'precepts'],
        answer: ['Yes, absolutely. Menstruation is a natural physiological function, not a moral fault or ritual pollution. Maintain clean attire and practice with a peaceful, respectful mind.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-khong-co-ban-tho',
        question: 'Can I chant on the app if I don’t have an altar at home?',
        keywords: ['no altar', 'chant at home', 'phone app'],
        answer: ['Yes. You can recite anywhere that is clean, quiet, and respectful. Sincere reverence directed toward the Buddha in your heart is what truly matters.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-xoa-trinh-duyet',
        question: 'Will my cultivation streak be lost if I clear browser cache?',
        keywords: ['cache', 'clear data', 'lost data', 'sync'],
        answer: ['Local-only data may be reset. Sign in with Google or Facebook to ensure your progress is backed up to the cloud before clearing data or switching devices.'],
        editorialStatus: 'verified',
      },
      {
        id: 'faq-dung-tren-may-tinh',
        question: 'Can I use this app on desktop computers and laptops?',
        keywords: ['desktop', 'laptop', 'windows', 'mac', 'pwa'],
        answer: ['Yes. Open the website in any modern browser on Windows, Mac, or Linux. You can also install it as a standalone desktop app via your browser’s install menu.'],
        editorialStatus: 'verified',
      },
    ],
  },
];

export const enGuideJumpLinks = [
  { id: 'cai-app', icon: '📱', label: 'Install App' },
  { id: 'dung-web', icon: '🧭', label: 'Using Web' },
  { id: 'huong-dan-nguoi-moi', icon: '🌱', label: 'Beginners' },
  { id: 'huong-dan-tung-kinh', icon: '📖', label: 'Sutra Chanting' },
  { id: 'huong-dan-tri-chu', icon: '📿', label: 'Mantra Recitation' },
  { id: 'tho-tuong-tai-gia', icon: '🪔', label: 'Altar Setup' },
  { id: 'thuc-hanh-hang-ngay', icon: '📋', label: 'Daily Practice' },
  { id: 'bo-thi-may-nghe-phap', icon: '📻', label: 'Dharma Giving' },
  { id: 'gioi-thieu-tac-gia', icon: '👤', label: 'Author Info' },
  { id: 'hoi-dap-thuong-gap', icon: '❓', label: 'Q & A' },
] as const;
