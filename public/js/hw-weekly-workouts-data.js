/**
 * 52 weekly immersion workouts — weeks 1–31 from JD's Japanese Daily Workout Calendar (2022).
 * Weeks 32–52 extend the same spirit for a full year.
 */
(function (global) {
  "use strict";

  const WEEKS = [
    {
      week: 1,
      image: "/images/workouts/w01.png?v=1",
      title: "Verb & adjective swap",
      task:
        "Write down 5 common verbs or adjectives. Whenever you say one of those words in your native language, say it in Japanese right after — make a sentence if you can.",
    },
    {
      week: 2,
      image: "/images/workouts/w02.png?v=1",
      title: "Karaoke sing-along",
      task: "Watch 3–5 karaoke songs in Japanese and sing along as much as you can.",
    },
    {
      week: 3,
      image: "/images/workouts/w03.png?v=1",
      title: "Kitchen vocabulary",
      task: "Open your fridge or freezer and learn 5 new food words.",
    },
    {
      week: 4,
      image: "/images/workouts/w04.png?v=1",
      title: "Passive watch",
      task:
        "Watch any anime or show in Japanese with Japanese subtitles — no notes. Max 60 minutes unless you're intermediate or higher.",
    },
    {
      week: 5,
      image: "/images/workouts/w05.png?v=1",
      title: "Five reasons",
      task:
        "Write 5 reasons why you like something (Japanese, a person, a hobby, etc.). Try to use から or だから.",
    },
    {
      week: 6,
      image: "/images/workouts/w06.png?v=1",
      title: "Question bank",
      task:
        "Write down 5 questions. Record yourself asking them — answer them later or on another day. Save videos to a new album.",
    },
    {
      week: 7,
      image: "/images/workouts/w07.png?v=1",
      title: "Rest week",
      task: "Rest! Take at least one rest day from active study this week — light listening is fine.",
      rest: true,
    },
    {
      week: 8,
      image: "/images/workouts/w08.png?v=1",
      title: "Letter to anyone",
      task:
        "Write a letter to anyone — alive, dead, a TV character — about any topic you like. Japanese only.",
    },
    {
      week: 9,
      image: "/images/workouts/w09.png?v=1",
      title: "Jelly lesson",
      task:
        "Watch a Jelly lesson. If you've watched them all, find a new lesson-style video online and take one note.",
    },
    {
      week: 10,
      image: "/images/workouts/w10.png?v=1",
      title: "Today — will do",
      task: "Write down 5 things you think you will do today.",
    },
    {
      week: 11,
      image: "/images/workouts/w11.png?v=1",
      title: "Today — won't do",
      task: "Write down 5 things you think you won't do today.",
    },
    {
      week: 12,
      image: "/images/workouts/w12.png?v=1",
      title: "Yesterday — did",
      task: "Write down 5 things you did yesterday.",
    },
    {
      week: 13,
      image: "/images/workouts/w13.png?v=1",
      title: "Yesterday — didn't",
      task: "Write down 5 things you didn't do yesterday.",
    },
    {
      week: 14,
      image: "/images/workouts/w14.png?v=1",
      title: "Mirror introduction",
      task:
        "Practice introducing yourself in a mirror — name, where you're from, nice to meet you. Don't forget to practice bowing.",
    },
    {
      week: 15,
      image: "/images/workouts/w15.png?v=1",
      title: "Recipe aloud",
      task:
        "Explain aloud (to an imaginary Japanese person) how to make one of your favorite dishes — tacos, fried rice, anything.",
    },
    {
      week: 16,
      image: "/images/workouts/w16.png?v=1",
      title: "Podcast hunt",
      task:
        "Listen to a whole episode of a Japanese podcast. Listen for words and grammar you've studied before.",
    },
    {
      week: 17,
      image: "/images/workouts/w17.png?v=1",
      title: "けいたいどこ？",
      task:
        'From now on, whenever you look for your phone, say "けいたいどこ？" instead of "where\'s my phone?"',
    },
    {
      week: 18,
      image: "/images/workouts/w18.png?v=1",
      title: "Describe your type",
      task:
        "Describe out loud what kind of person you'd want to date or marry — time to use some adjectives!",
    },
    {
      week: 19,
      image: "/images/workouts/w19.png?v=1",
      title: "Pack for Japan",
      task:
        "You're going to take a trip to Japan! Record yourself saying all the items you will pack.",
    },
    {
      week: 20,
      image: "/images/workouts/w20.png?v=1",
      title: "Read an article",
      task:
        "Try reading one article from an easy Japanese news site (NHK News Web Easy or similar). One paragraph is enough to start.",
    },
    {
      week: 21,
      image: "/images/workouts/w21.png?v=1",
      title: "Draw & speak",
      task:
        "Draw a picture of 5 Japanese words you know. Say a sentence aloud for each word — try combining them into one sentence.",
    },
    {
      week: 22,
      image: "/images/workouts/w22.png?v=1",
      title: "Time in Japanese",
      task: "From now on, whenever you check the time, say it out loud in Japanese.",
    },
    {
      week: 23,
      image: "/images/workouts/w23.png?v=1",
      title: "Five-minute overlap",
      task:
        "Set a timer for 5 minutes. Watch Japanese anime or a show and overlap — repeat every word as accurately as you can until the timer runs out.",
    },
    {
      week: 24,
      image: "/images/workouts/w24.png?v=1",
      title: "Count to 100",
      task: "Count from 1 to 100 in Japanese by the end of the week.",
    },
    {
      week: 25,
      image: "/images/workouts/w25.png?v=1",
      title: "Touch & learn",
      task:
        "The next 5 objects you touch, learn what they're called in Japanese. If you already know the word, it doesn't count — find a new one.",
    },
    {
      week: 26,
      image: "/images/workouts/w26.png?v=1",
      title: "Food email",
      task:
        "Send an email to yourself in Japanese about your favorite Western foods and favorite Japanese foods.",
    },
    {
      week: 27,
      image: "/images/workouts/w27.png?v=1",
      title: "Don't want this year",
      task: "Write 5 things you don't want to do this year.",
    },
    {
      week: 28,
      image: "/images/workouts/w28.png?v=1",
      title: "Didn't want last year",
      task: "Write 5 things you didn't want to do last year.",
    },
    {
      week: 29,
      image: "/images/workouts/w29.png?v=1",
      title: "ちいさんぽ",
      task:
        "Watch an episode of ちいさんぽ and write down words you hear 3 or more times.",
    },
    {
      week: 30,
      image: "/images/workouts/w30.png?v=1",
      title: "Game or phone JP",
      task:
        "Play a video game in Japanese for 30 minutes without looking up words — then write the 5 words you remember most. Or switch your phone settings to Japanese for the day.",
    },
    {
      week: 31,
      image: "/images/workouts/w31.png?v=1",
      title: "Silly story or song",
      task:
        "Choose one: write a silly story at least 5 sentences long, or write a silly song at least 5 sentences long.",
    },
    {
      week: 32,
      image: "/images/workouts/w32.png?v=1",
      title: "Month in review",
      task: "Write 5 things you noticed about Japanese this month — in Japanese if you can.",
    },
    {
      week: 33,
      image: "/images/workouts/w33.png?v=1",
      title: "One app in Japanese",
      task: "Switch one app you use daily to Japanese for at least 24 hours.",
    },
    {
      week: 34,
      image: "/images/workouts/w34.png?v=1",
      title: "Room tour",
      task: "Describe your room aloud in Japanese — 5+ sentences.",
    },
    {
      week: 35,
      image: "/images/workouts/w35.png?v=1",
      title: "日本 + interest",
      task:
        "Search YouTube for 日本 + something you’re interested in (in Japanese). Watch a video that looks interesting for 10+ minutes.",
    },
    {
      week: 36,
      image: "/images/workouts/w36.png?v=1",
      title: "Teach one phrase",
      task:
        "Teach someone you know a useful Japanese phrase and when to use it. If you struggle with it, it’ll help you remember!",
    },
    {
      week: 37,
      image: "/images/workouts/w37.png?v=1",
      title: "Sticky labels",
      task:
        "Label 10 items in your home with sticky notes in Japanese (hiragana, katakana, or kanji).",
    },
    {
      week: 38,
      image: "/images/workouts/w38.png?v=1",
      title: "Manga aloud",
      task:
        "Read one manga page out loud. Don’t worry about understanding it — guess at what it might mean.",
    },
    {
      week: 39,
      image: "/images/workouts/w39.png?v=1",
      title: "Shadow 5 minutes",
      task:
        "Shadow 5 minutes of Japanese video content (vlog, anime, drama, etc.). Match the sound as closely as you can — mumbling and rough copies count.",
      tip:
        "What is shadowing? Play a short clip and speak along with it in real time — like a soft echo of the speaker. You’re training your mouth and ears together, not translating. Start with short sentences; rewind as much as you need.",
    },
    {
      week: 40,
      image: "/images/workouts/w40.png?v=1",
      title: "Tomorrow in Japanese",
      task:
        "Write 5 things you’ll do tomorrow in Japanese — no matter how boring or silly they are.",
      bonus: "Now say them out loud!",
    },
    {
      week: 41,
      image: "/images/workouts/w41.png?v=1",
      title: "Cook & name",
      task: "Listen to Japanese music or radio while cooking and name 5 ingredients out loud in Japanese.",
    },
    {
      week: 42,
      image: "/images/workouts/w42.png?v=1",
      title: "Mirror compliments",
      task:
        "Give yourself 5 compliments in Japanese in the mirror — use words you actually want to remember.",
      examples: ["そのシャツ、かっこいいですね。", "髪の毛、いい感じ！"],
    },
    {
      week: 43,
      image: "/images/workouts/w43.png?v=2",
      title: "Settings day",
      task: "Set your computer or tablet display language to Japanese for one full day (or longer!).",
    },
    {
      week: 44,
      image: "/images/workouts/w44.png?v=1",
      title: "Weather diary",
      task: "Write a short diary entry about today's weather and how you feel — 4+ sentences.",
    },
    {
      week: 45,
      image: "/images/workouts/w45.png?v=1",
      title: "Order food",
      task: "Practice ordering food at an imaginary restaurant — full exchange from greeting to thank you.",
    },
    {
      week: 46,
      image: "/images/workouts/w46.png?v=1",
      title: "Katakana hunt",
      task: "Find 5 katakana loanwords in your house or on packaging. Say each in a sentence.",
    },
    {
      week: 47,
      image: "/images/workouts/w47.png?v=1",
      title: "Outside tour guide",
      task:
        "Go outside and try to talk about what you see, as if you were a tour guide for your friend.",
    },
    {
      week: 48,
      image: "/images/workouts/w48.png?v=1",
      title: "Today / yesterday / tomorrow",
      task: "Say today’s date, yesterday’s, and tomorrow’s.",
      examples: [
        "今日は２日です。",
        "今日は金曜日です。",
        "昨日は……。",
        "明日は……。",
      ],
      bonus:
        "If that was easy, say something you’re going to do today / tomorrow and something you did yesterday.",
    },
    {
      week: 49,
      image: "/images/workouts/w49.png?v=1",
      title: "Body parts",
      task: "In a mirror, point to and name 10 body parts in Japanese — add one sentence using each.",
    },
    {
      week: 50,
      image: "/images/workouts/w50.png?v=1",
      title: "Real text practice",
      task:
        "Text your actual friend or family member in Japanese — someone who doesn’t mind you practicing.",
    },
    {
      week: 51,
      image: "/images/workouts/w51.png?v=1",
      title: "Questions for JD",
      task:
        "Write 1–3 unanswered questions you have about Japanese. They will be sent to JD.",
    },
    {
      week: 52,
      image: "/images/workouts/w52.png?v=1",
      title: "Year wrap-up",
      task:
        "Write what you’re glad you did this year with 〜てよかった (“I’m glad I…”), and what you want next year with 〜たい. Aim for a few of each — then read them aloud.",
      examples: ["日本語を続けてよかった。", "来年は日本に行きたい。"],
    },
  ];

  global.HwWeeklyWorkoutsData = {
    TOTAL_WEEKS: WEEKS.length,
    weekAt(n) {
      const num = Math.max(1, Math.min(WEEKS.length, Number(n) || 1));
      return WEEKS[num - 1];
    },
    allWeeks() {
      return WEEKS.slice();
    },
  };
})(window);
