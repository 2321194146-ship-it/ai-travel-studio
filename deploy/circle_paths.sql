UPDATE "CirclePost"
SET "imageUrl" = replace("imageUrl", '/mf-assets/seed/circle-p', '/outputs/circle-p'),
    "imageUrls" = replace("imageUrls"::text, '/mf-assets/seed/circle-p', '/outputs/circle-p')::jsonb
WHERE id IN ('seed_p5', 'seed_p6', 'seed_p7');
