/**
 * Article text crawl preview — TN-style card + Star Wars scroll-up body.
 * Standalone prototype (News-Herald / TN not in this workspace).
 */
(function () {
  "use strict";

  /** Cap crawl body so long wire copy stays readable in the panel. */
  var MAX_CHARS = 2200;

  var ARTICLES = [
    {
      id: "vanhuss-denison",
      hed: "Mentor volleyball: Audri VanHuss continues to grow as a leader after her commitment to Denison",
      dek: "The Cardinals senior made her commitment to Denison University after helping Mentor to a state runner-up finish.",
      href: "https://www.news-herald.com/2026/07/22/mentor-volleyball-audri-vanhuss-continue-to-grow-as-a-leader-after-her-commitment-to-denison/",
      /* Full-bleed sample art (large enough for the TN slot) */
      image:
        "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=900&q=80",
      letterbox: false,
      body: [
        "Last season, the Mentor volleyball team was led by seniors Kayden McKinney, Melody Garrett and Anna Cassidy. In the background, several underclassmen were developing their skills.",
        "One of those players was Audri VanHuss. She finished last season with 1.6 kills per set and 0.6 blocks while playing a significant role in the Cardinals’ run to a state runner-up finish.",
        "That play, plus her work at the Junior Olympic level, started to turn heads, including those at Denison University. The senior made her commitment to the Big Red.",
        "“From the start, Denison was definitely one of my top choices,” VanHuss said. “It’s a school known for its high academic standards, and when they offered me the chance to play volleyball, it was an amazing opportunity. I get to keep playing the sport I love and attend one of my top schools.”",
        "While learning how to be a leader over the summer has been important, VanHuss is also excited to learn how to improve her game at the next level.",
        "“Coach Cassell builds his program on trust and accountability, which has allowed them to create a culture of success followed by continuous improvement,” VanHuss said.",
        "Before she makes the trek to Granville, VanHuss will be tasked to lead a younger Mentor contingent this season. She will see her role from the middle expand compared to last year.",
        "“We’ve got some big shoes to fill as a team,” VanHuss said. “Not just in terms of skill, but also in leadership. As the only returning captain, my goal is to maintain the culture that Mel, Kayden, and Anna created… I can’t wait to get started.”",
      ].join("\n\n"),
    },
    {
      id: "larson-retirement",
      hed: "Nebraska volleyball legend knows she deserves to decide when it’s retirement time",
      dek: "Jordan Larson reversed course on retirement and will return for LOVB Nebraska — on her own terms.",
      href: "https://huskercorner.com/nebraska-volleyball-jordan-larson-comes-out-retirement-lovb",
      /* Intentionally small mug-style art → letterboxed on dark (TN rule) */
      image:
        "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=240&q=60",
      letterbox: true,
      body: [
        "Former Nebraska volleyball star Jordan Larson has had an incredible career — from the teams that started the current run of excellence to Olympic and professional heroics, a stretch as an assistant, and then retirement.",
        "The retirement didn’t stick.",
        "Larson originally thought her playing days were over back in April. Earlier this month she realized that she wasn’t quite ready to call it a career. She has more to accomplish and officially reversed her position.",
        "“I felt so good as I kept playing, and then I just was like, ‘I get to do this at home. Like, why am I actually stopping?’ So I think it was just a lot of that back and forth most of the season, and even towards the end,” the Nebraska volleyball legend said. “I think even having the confidence to say that I want to play again. I think that was also scary.”",
        "A big factor at 39 is that she doesn’t need to be away from friends and family — something that wasn’t always true when she played overseas.",
        "Larson understands some people might be confused about why she unretired so quickly. She’s not worried about the guff.",
        "“Yeah, I said these things. Things change and times change. And I still feel good, and I love what I do, so it’s okay.”",
      ].join("\n\n"),
    },
    {
      id: "sample-short",
      hed: "Short sample: crawl still works on a brief lede",
      dek: "When the body is short, the crawl finishes sooner — still the same peek pattern.",
      href: "#",
      image:
        "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80",
      letterbox: false,
      body:
        "This is a short stand-in article body for the crawl preview.\n\nHover Peek text on a real story card and the panel uses that article’s words — not placeholder lorem — so editors can skim before opening the full page.",
    },
  ];

  var grid = document.getElementById("ac-grid");
  var crawlEl = document.getElementById("ac-crawl");
  var scrollEl = document.getElementById("ac-crawl-scroll");
  var titleEl = document.getElementById("ac-crawl-title");
  var bodyEl = document.getElementById("ac-crawl-body");
  var lastFocus = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clipBody(text) {
    var t = String(text || "").trim();
    if (t.length <= MAX_CHARS) return t;
    var cut = t.slice(0, MAX_CHARS);
    var lastBreak = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
    if (lastBreak > MAX_CHARS * 0.55) cut = cut.slice(0, lastBreak + (cut[lastBreak] === "." ? 1 : 0));
    return cut.trim() + "…";
  }

  function bodyToHtml(text) {
    return clipBody(text)
      .split(/\n\n+/)
      .map(function (p) {
        return "<p>" + escapeHtml(p) + "</p>";
      })
      .join("");
  }

  function renderCards() {
    if (!grid) return;
    grid.innerHTML = ARTICLES.map(function (a) {
      var mediaClass = "ac-card__media" + (a.letterbox ? " ac-card__media--letterbox" : "");
      return (
        '<article class="ac-card" data-ac-id="' +
        escapeHtml(a.id) +
        '">' +
        '<div class="' +
        mediaClass +
        '">' +
        '<img class="ac-card__img" src="' +
        escapeHtml(a.image) +
        '" alt="" loading="lazy" width="640" height="400">' +
        "</div>" +
        '<div class="ac-card__body">' +
        '<h2 class="ac-card__hed">' +
        escapeHtml(a.hed) +
        "</h2>" +
        '<p class="ac-card__dek">' +
        escapeHtml(a.dek) +
        "</p>" +
        '<div class="ac-card__actions">' +
        '<button type="button" class="ac-btn ac-btn--crawl" data-ac-peek>Peek text</button>' +
        (a.href && a.href !== "#"
          ? '<a class="ac-btn" href="' +
            escapeHtml(a.href) +
            '" target="_blank" rel="noopener noreferrer">Open article</a>'
          : "") +
        "</div>" +
        "</div>" +
        "</article>"
      );
    }).join("");
  }

  function findArticle(id) {
    for (var i = 0; i < ARTICLES.length; i++) {
      if (ARTICLES[i].id === id) return ARTICLES[i];
    }
    return null;
  }

  function openCrawl(article, trigger) {
    if (!crawlEl || !article) return;
    lastFocus = trigger || document.activeElement;
    titleEl.textContent = article.hed;
    bodyEl.innerHTML = bodyToHtml(article.body);
    crawlEl.hidden = false;
    document.body.style.overflow = "hidden";

    /* Restart animation cleanly */
    scrollEl.classList.add("is-restarting");
    void scrollEl.offsetWidth;
    scrollEl.classList.remove("is-restarting");

    var closeBtn = crawlEl.querySelector(".ac-crawl__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeCrawl() {
    if (!crawlEl || crawlEl.hidden) return;
    crawlEl.hidden = true;
    document.body.style.overflow = "";
    scrollEl.classList.add("is-restarting");
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (e) {
        /* ignore */
      }
    }
    lastFocus = null;
  }

  function onGridClick(e) {
    var peek = e.target.closest("[data-ac-peek]");
    if (!peek || !grid.contains(peek)) return;
    var card = peek.closest(".ac-card");
    var article = findArticle(card && card.getAttribute("data-ac-id"));
    openCrawl(article, peek);
  }

  function onKey(e) {
    if (e.key === "Escape") closeCrawl();
  }

  renderCards();
  if (grid) grid.addEventListener("click", onGridClick);
  document.addEventListener("keydown", onKey);
  if (crawlEl) {
    crawlEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-ac-close]")) closeCrawl();
    });
  }
})();
