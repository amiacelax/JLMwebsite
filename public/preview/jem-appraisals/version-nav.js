(function () {
  var h = location.hostname.toLowerCase();
  if (h === "jem-appraisals.com" || h === "www.jem-appraisals.com") {
    document.documentElement.classList.add("jem-production");
  }
})();
