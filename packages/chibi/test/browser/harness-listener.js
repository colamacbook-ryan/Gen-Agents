// Chạy TRƯỚC mọi thứ khác: ghi lại mọi vi phạm CSP (securitypolicyviolation) để test khẳng định 0 vi phạm.
window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample });
});
