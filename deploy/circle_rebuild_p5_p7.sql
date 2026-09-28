BEGIN;

INSERT INTO "CirclePost" (id, "userId", content, "imageUrl", "imageUrls", status, "isSeed", likes, "createdAt", "updatedAt")
VALUES
  ('seed_p5', 'seed_u1', '试了下中分加窄框眼镜，没想到差别这么明显。以前拍证件照总觉得脸很钝，主要还是发型和镜框没选对。先把这组留着，给同样纠结眼镜的兄弟参考一下。', '/mf-assets/seed/circle-p5.jpg', '["/mf-assets/seed/circle-p5.jpg"]'::jsonb, 'PUBLISHED', true, 26, NOW() - INTERVAL '18 minutes', NOW()),
  ('seed_p6', 'seed_u3', '把锅盖刘海往两边分开，整个人终于不再像刚睡醒😂 没有烫很夸张，就是把分缝、两边和头顶的蓬松度弄对了，感觉人精神了不少。', '/mf-assets/seed/circle-p6.jpg', '["/mf-assets/seed/circle-p6.jpg"]'::jsonb, 'PUBLISHED', true, 19, NOW() - INTERVAL '12 minutes', NOW()),
  ('seed_p7', 'seed_u4', '这组先认领一下，前面是刚起床，后面是自己拿吹风机乱吹，确实有点用力过猛😂 留着当反面教材吧。下次还是按发型建议来，别对着镜子凭感觉硬吹。', '/mf-assets/seed/circle-p7.jpg', '["/mf-assets/seed/circle-p7.jpg"]'::jsonb, 'PUBLISHED', true, 14, NOW() - INTERVAL '6 minutes', NOW())
ON CONFLICT (id) DO UPDATE SET
  "userId" = EXCLUDED."userId",
  content = EXCLUDED.content,
  "imageUrl" = EXCLUDED."imageUrl",
  "imageUrls" = EXCLUDED."imageUrls",
  status = EXCLUDED.status,
  "isSeed" = EXCLUDED."isSeed",
  likes = EXCLUDED.likes,
  "updatedAt" = NOW();

INSERT INTO "CircleComment" (id, "postId", "userId", content, status, "createdAt", "updatedAt")
VALUES
  ('seed_c17', 'seed_p5', 'seed_u2', '眼镜框一换，脸型的线条确实出来了。这个前后很直观。', 'PUBLISHED', NOW() - INTERVAL '15 minutes', NOW()),
  ('seed_c18', 'seed_p5', 'seed_u4', '求个镜框型号，感觉窄一点真的更利落。', 'PUBLISHED', NOW() - INTERVAL '13 minutes', NOW()),
  ('seed_c19', 'seed_p6', 'seed_u1', '中分比盖住眼睛精神多了，头顶有蓬松度就不显贴。', 'PUBLISHED', NOW() - INTERVAL '10 minutes', NOW()),
  ('seed_c20', 'seed_p6', 'seed_u2', '这个变化挺真实的，不是换张脸，就是发型方向对了。', 'PUBLISHED', NOW() - INTERVAL '8 minutes', NOW()),
  ('seed_c21', 'seed_p7', 'seed_u3', '哈哈这个自嘲很真实，吹风机真的不能随便乱怼。', 'PUBLISHED', NOW() - INTERVAL '4 minutes', NOW()),
  ('seed_c22', 'seed_p7', 'seed_u1', '反面教材也有用，至少能看出来什么叫两边没收干净。', 'PUBLISHED', NOW() - INTERVAL '2 minutes', NOW())
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  "updatedAt" = NOW();

COMMIT;
