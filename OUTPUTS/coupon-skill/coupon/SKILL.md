---
name: coupon
description: "Find the lowest real checkout price for something Jorge wants to buy online. Hunts promo codes from the store, creator and newsletter offers, RedFlagDeals, Reddit and coupon sites, tests every code in the real cart, then stacks cashback, discounted gift cards and price match on top. Use whenever Jorge mentions a promo code, coupon, discount code, deal, cheapest price, a checkout he is about to complete, pastes a product link asking if there is a code, or types /coupon."
---

# Coupon hunter

Goal: the lowest real price at checkout, after tax and shipping. A code only counts if it lowers the cart total. Most coupon-site codes are stale or fake, so testing in the cart is what makes this work.

Second rule: the best saving is often not a code. Stack everything that legitimately stacks, and report the all-in price.

Defaults: Jorge is in Victoria, BC, Canada. Use the Canadian storefront, CAD, and BC tax (5% GST plus 7% PST on most goods). Use a US site only if he says so.

## Input

You need the store and the item. A product link is best. If either is missing, ask once for both and nothing else. Start as soon as you have them.

## Step 0. Check the log

If you have file access, read `OUTPUTS/coupon/coupon-log.md`. Pull every past entry for this store: codes that worked, codes that failed, what stacked, the cashback rate. Retest past winners first. Skip codes marked Failed in the last 60 days unless a new source reposts them. If there is no file access, skip this step and Step 5.

## Step 1. Baseline

Open the product and record: price, size or variant, whether it is already on sale, shipping cost, free-shipping threshold, and the total before payment. Every option is measured against this number.

Note the store's platform. Shopify, WooCommerce, Amazon.ca and big-box retailers behave differently. See `references/playbook.md`.

## Step 2. Find candidates

Search in this order. Highest hit rate first. Exact queries are in `references/sources.md`.

1. **The store itself:** promo or deals page, site banner, signup popup offer, SMS offer, help or FAQ page on discounts, social accounts.
2. **Creator and partner codes:** YouTube descriptions, podcast sponsor reads, Instagram and TikTok bios, affiliate reviews. These are often reusable and last longer than coupon-site codes.
3. **Community, last 30 days:** RedFlagDeals Hot Deals and the store's RFD thread, Reddit search for the store name plus "code".
4. **Coupon sites, leads only:** RetailMeNot, CouponFollow, Dealspotr, Knoji. Prefer listings that show a recent "last worked" date.

Collect up to 12 candidates. For each, record: code, source link, date posted, claimed discount, and stated conditions (minimum spend, exclusions, new customers only, expiry).

Test in this order: store-official, then creator codes, then community posts under 30 days old, then coupon sites.

Never invent a code. One narrow exception: up to 5 pattern guesses from `references/playbook.md`, only when you can test them in the cart, and only reported if they work.

## Step 3. Test every code in the cart

Pick a browser in this order: Claude in Chrome (load the chrome-browser skill first), then the built-in browser (load the built-in-browser skill first). Use whichever is connected.

1. Open the product in a new tab. Add the right variant and quantity to the cart.
2. Go to the cart or checkout page with the promo field.
3. Enter one code. Record the exact result: the new total, or the store's error text word for word.
4. Remove the code before trying the next one, so results don't mix.
5. If a code fails on a condition (minimum spend, excluded item), record the condition and label it Conditional. If the gap to the minimum is small, work out whether adding something Jorge would buy anyway lowers his net cost. Report it as an option. Never add items to the cart yourself.
6. If two codes work, test whether they stack, including a code on top of an automatic sale.
7. If the store shows a CAPTCHA or "too many attempts", stop testing that store. Label the rest Unverified and say why.

Safety rules, no exceptions:
- Stop before any payment step.
- Never enter payment details or place an order.
- Never create an account, sign up for a newsletter or SMS, or subscribe to anything without asking first.
- If the promo field needs a login, stop and ask Jorge to sign in.

No browser connected: label every code Unverified, still rank them by likelihood, and say in one line that turning on Claude in Chrome would let you test them.

## Step 4. Stack the rest

Do this whether or not a code worked. For each item, give the dollar value and whether it stacks with the winning code.

- **Cashback portal:** Rakuten.ca, Great Canadian Rebates. Check the portal's terms. Many void cashback when a code from outside the portal is used.
- **Discounted gift cards:** Costco gift card packs, grocery or pharmacy bonus-points events on gift cards. Paying with a gift card bought at 15 to 20% off usually stacks with everything.
- **Card-linked offers:** any offer on a card Jorge has, such as Amex Offers. Ask once if you don't know which cards he has.
- **First-order, newsletter or SMS offer:** value, plus whether it needs a new email or phone number. Ask before signing up.
- **Price match:** the store's policy, plus the cheaper Canadian competitor with a link.
- **Cheaper elsewhere in Canada:** the manufacturer, Costco, Best Buy, Amazon.ca (check the seller and shipping), Google Shopping.
- **Timing:** is the current "sale" real? Use price history (camelcamelcamel for Amazon.ca). Name the next sale event for this store and its date. Give a buy-now-or-wait call.
- **After purchase:** the store's price adjustment window in days, so Jorge can claim a drop later.
- **Cart nudge:** if Jorge is signed in and not in a rush, some stores email a discount 1 to 3 days after a cart is left. Label it a maybe with no dollar value.

Order matters. A cashback click usually has to happen before adding to cart. Write the steps in the order Jorge must do them.

## Step 5. Update the log

Append one entry to `OUTPUTS/coupon/coupon-log.md` using the template in `references/log-template.md`. Create the file with the header if it doesn't exist. Log every code tested, not just winners. Failed codes save time on the next hunt.

## Labels

- **Verified:** tested in the cart and the total dropped. State the new total.
- **Conditional:** works only if a condition is met. State the condition.
- **Failed:** tested and rejected. Quote the error.
- **Unverified:** not tested.

## Output

Under 300 words plus the table. Plain English. No em dashes.

**Best price:** $X CAD all-in, was $Y. You save $Z (N%).
Numbered steps in the order to do them. Example: 1. Click through Rakuten. 2. Add to cart. 3. Enter code ABC. 4. Pay with the discounted gift card.

**Buy now or wait:** one line with the reason.

**Codes tested:**

| Code | Source | Posted | Result | Label |
|---|---|---|---|---|

**Other savings:** bullets with the dollar value and "stacks" or "doesn't stack".

Never pad the list with guesses. "No working code" is a valid answer as long as the best alternative comes with it.

## Done

Done means every candidate is tested or labelled, the stack is worked out, a best all-in price is stated, and the log is updated. Keep going until then. Don't stop to offer to continue.
