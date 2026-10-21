const toggle = document.querySelector("[data-nav-toggle]");
const navigation = document.getElementById("primary-navigation");
const mobile = window.matchMedia("(max-width: 800px)");
function closeMenu() {
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open menu");
  navigation.hidden = mobile.matches;
}
toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  navigation.hidden = !open;
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    toggle.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    toggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (mobile.matches && !event.target.closest(".site-header")) closeMenu();
});
navigation
  ?.querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", closeMenu));
mobile.addEventListener("change", closeMenu);
if (toggle && navigation) closeMenu();
