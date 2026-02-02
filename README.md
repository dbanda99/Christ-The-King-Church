# Christ The King Catholic Church (Bootstrap)

A clean, professional multi-page website built with **HTML + Bootstrap 5 + vanilla JavaScript**.

## Pages
- Home: `index.html`
- Worship: `worship.html`
- News: `news.html`
- Bulletin: `bulletin.html`
- Ministries: `ministries.html`
- Giving: `giving.html`
- Contact: `contact.html`
- Privacy/Accessibility: `privacy.html`, `accessibility.html`

## Animations
Uses AOS (Animate On Scroll) via CDN.

## Images
All images are placeholders from https://picsum.photos (replace anytime).

## Language switcher
Top-right dropdown includes Google Translate website widget (EN/ES).  
You can also rely on browser translate if preferred.

## Online Giving (Stripe / Apple Pay)
This template uses a **Stripe Payment Link**.
1. Create a Payment Link in your Stripe dashboard.
2. Replace the `data-payment-link` value in `giving.html` with your real link.

Apple Pay:
- Enable Apple Pay in Stripe (and complete any required domain verification).
- Apple Pay will appear automatically for eligible devices **when served over HTTPS**.

## Local preview
Just open `index.html` in your browser, or use a simple static server:
- VSCode Live Server extension
- or `python -m http.server` (then open http://localhost:8000)

