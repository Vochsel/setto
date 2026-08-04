---
description: Use when shooting a product — picking the person, place and art direction, and getting agreement on cost before generating.
---

# Shooting a product well

The order matters. Most bad results come from generating before knowing what
the shot is.

1. **Check the product has a reference image.** `list_products` returns
   `imageUrl`. If it's missing, say so and stop — without a photo of the actual
   product the model invents one, and the result is a plausible garment that
   isn't theirs.

2. **Pick the person and place deliberately.** `list_cast` gives you both. If
   they've shot this kind of product before, reuse what worked rather than
   rotating for novelty — a catalogue wants consistency. Say which you picked
   and why, in a few words.

3. **Write art direction, not a description of the product.** The product comes
   from its reference image; the prompt should carry what the *photo* is —
   pose, action, time of day, mood. "Walking, looking away, late afternoon" is
   useful. "A blue t-shirt" is not, and competes with the reference.

4. **Quote before you spend.** Say what you'd generate and the rough cost, then
   wait for a yes. Start with 1–2 images, not the maximum: a cheap first look
   tells you whether the direction is right before you spend on volume.

5. **Then generate**, tell them it's running, and come back with the images
   from `show_gallery` once they've finished.

## Variants

For a product with colourways, shoot the base first and get a reaction. Once
they like the framing, run the rest of the variants with the *same* person,
place and direction — the whole point of a variant set is that only the product
changes.

## When it comes back wrong

Ask what specifically is off before regenerating: framing, the person, the
setting, or the product itself looking wrong. Regenerating with the same inputs
and hoping is the most expensive way to fix nothing.
