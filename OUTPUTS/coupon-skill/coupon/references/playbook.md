# Playbook

## Pattern guesses

Use only when you can test in the cart. Maximum 5 per store. Report a guess only if it works, and label its source "Pattern guess". Never present a guess as a found code.

Try in this order:
1. `WELCOME10`
2. `WELCOME15`
3. `FIRST10`
4. `SAVE10`
5. `<STORENAME>10`, for example `ACME10`

Skip guesses on stores that lock the promo field after a few failures.

## Platform notes

**Shopify stores.** Signs: `cdn.shopify.com` in the page source, or `/cart` and `/checkouts/` in URLs.
- Usually one code per order. A code often replaces an automatic discount instead of adding to it. Compare both totals.
- A code can be applied with a link: `https://<store domain>/discount/<CODE>`. Use this when the promo field only appears late in checkout.
- The promo field is on the checkout page, sometimes only after an email is entered. If an email is required, stop and ask Jorge.

**WooCommerce stores.** Signs: `wp-content` in the page source.
- Often accepts more than one coupon. Always test stacking two working codes.

**Amazon.ca.**
- Few promo-field codes. Look for a "Coupon" checkbox on the product page, Subscribe and Save, and "Special offers" on the listing.
- Check the seller. A cheaper third-party seller can mean a slower or riskier order.
- Use camelcamelcamel for price history.

**Big-box retailers (Best Buy, Canadian Tire, Walmart, Home Depot).**
- Public codes are rare. Most coupon-site codes for them are fake.
- Better levers: price match, loyalty points events, discounted gift cards, and open-box or clearance.

## Reading the result

- Compare the total before payment, with tax and shipping. Not the subtotal.
- Some codes remove free shipping or exclude sale items. A smaller code on full price can beat a bigger one that kills free shipping.
- Percent codes beat dollar codes on larger carts. Do the math on the actual cart.

## Stacking order

1. Sign in to the store if needed.
2. Click through the cashback portal.
3. Add to cart.
4. Apply the code.
5. Pay with the discounted gift card, then a card with a linked offer.

Write Jorge's steps in this order.
