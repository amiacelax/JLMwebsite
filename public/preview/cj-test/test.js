/* CJ test renderer. Data lives in items.js. Test pages have zero English. 漢字{よみ} = furigana. */
(function () {
  const mode = ["key", "pics"].includes(document.body.dataset.mode) ? document.body.dataset.mode : "test";
  const SECTIONS = window.CJ_SECTIONS || [];

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function rb(s) {
    return esc(s).replace(/([\u4e00-\u9fff\u3005]+)\{([^}]+)\}/g, "<ruby>$1<rt>$2</rt></ruby>");
  }

  let n = 0;
  const out = [];
  const picIndex = new Map();

  function pic(spec, num, no) {
    const parts = spec.split("|");
    const id = parts[0];
    if (!picIndex.has(id)) picIndex.set(id, { id: id, search: parts[1] || id, nums: [] });
    picIndex.get(id).nums.push(num);
    return (
      '<div class="pic' + (no ? " is-no" : "") + '"><img src="img/' + id + (/clock/.test(id) ? ".svg" : ".png") + '" alt="" onerror="this.remove()">' +
      (no ? '<span class="xmark" aria-hidden="true">✕</span>' : "") +
      "</div>"
    );
  }

  SECTIONS.forEach((sec) => {
    let body = "";
    sec.items.forEach((it) => {
      n += 1;
      body +=
        '<div class="item"><span class="q">' + n + "</span>" + pic(it[0], n, !!it[3]) +
        '<div class="body"><p class="ask" lang="ja">' + rb(it[1]) + "</p>" +
        '<div class="line">' + (mode === "key" ? '<span class="ans" lang="ja">' + rb(it[2]) + "</span>" : "") + "</div></div></div>";
    });
    out.push(
      '<section class="part"><h2><span>' + rb(sec.title) + "</span><em>" + sec.items.length + "問</em></h2><p class=\"note\">" + esc(sec.note || "Use the picture and your imagination to create an answer.") + "</p>" + body + "</section>"
    );
  });

  const total = n;
  const paper = document.getElementById("paper");
  if (mode === "pics") {
    const rows = [...picIndex.values()]
      .map(
        (p) =>
          '<tr><td><code>' + esc(p.id) + ".png</code></td><td lang=\"ja\">" + esc(p.search) + "</td><td>" + p.nums.join(", ") + "</td></tr>"
      )
      .join("");
    paper.innerHTML =
      '<header class="top"><h1>Pictures</h1><p class="meta"><span>' + picIndex.size +
      " pictures in img/ (file, search words, questions)</span></p></header>" +
      '<table class="pics-table"><thead><tr><th>File</th><th>Search</th><th>Q</th></tr></thead><tbody>' + rows + "</tbody></table>";
    document.title = "CJ Test pictures";
    return;
  }
  paper.innerHTML =
    '<header class="top"><h1>' + ((mode === "key" ? "こたえ" : "日本語{にほんご}のテスト") + (document.body.dataset.polite ? "（ていねい）" : "")).replace(/([\u4e00-\u9fff]+)\{([^}]+)\}/g, "<ruby>$1<rt>$2</rt></ruby>") + "</h1>" +
    '<p class="meta"><span>名前{なまえ}: <i></i></span><span>日付{ひづけ}: <i></i></span><span>点{てん}: <i class="short"></i> / ' + total + "</span></p></header>" +
    out.join("");
  paper.querySelectorAll(".meta span").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/([\u4e00-\u9fff]+)\{([^}]+)\}/g, "<ruby>$1<rt>$2</rt></ruby>");
  });
  document.title = (mode === "key" ? "CJ Test key" : "CJ Test") + (document.body.dataset.polite ? " polite" : "") + " — " + total;
})();
