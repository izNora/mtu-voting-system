-- MTU Voting System - CURRENT API aligned 200-user load-test seed
-- USE ONLY WITH A DEDICATED TEST DATABASE.
-- This script assumes database.sql has already created the current schema.
-- IMPORTANT: backend .env must contain exactly:
-- TOKEN_PEPPER=LOAD_TEST_ONLY_PEPPER_2026_CHANGE_ME
-- The matching credentials are in load_test_qr_urls_200.txt.

USE voting_system_test;
SET @load_target_id := 9001;
SET @load_admin_id := 9001;
SET @load_year := YEAR(CURDATE());

START TRANSACTION;
SET FOREIGN_KEY_CHECKS = 0;

-- Remove only the previous load-test fixture so this file can be rerun.
DELETE FROM votes WHERE voter_id IN (SELECT voter_id FROM voter_info WHERE major_id = @load_target_id);
DELETE FROM voter_info WHERE major_id = @load_target_id;
DELETE FROM major_selection WHERE target_id = @load_target_id OR c_id IN (SELECT c_id FROM candidates WHERE major_id = @load_target_id);
DELETE FROM whole_candidate WHERE c_id IN (SELECT c_id FROM candidates WHERE major_id = @load_target_id);
DELETE FROM the_whole_selection WHERE c_id IN (SELECT c_id FROM candidates WHERE major_id = @load_target_id);
DELETE FROM candidates WHERE major_id = @load_target_id;
DELETE FROM titles WHERE major_id = @load_target_id;
DELETE FROM completion WHERE major_id = @load_target_id;
DELETE FROM admin_table WHERE admin_id = @load_admin_id OR major_id = @load_target_id OR admin_gmail = 'loadtest-admin@example.com';
DELETE FROM majors WHERE major_id = @load_target_id;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO majors (major_id, major) VALUES (@load_target_id, 'LOAD TEST MAJOR');
INSERT INTO admin_table (admin_id, admin_name, major_id, admin_role, admin_gmail, admin_pswd, session_version) VALUES
(@load_admin_id, 'Load Test Admin', @load_target_id, 'major_admin', 'loadtest-admin@example.com', 'LOAD_TEST_NOT_FOR_LOGIN', 1);

-- Current titles schema requires major_id. Odd title_id => boy; even => girl.
INSERT INTO titles (title_id, title, major_id) VALUES
    (92001, 'King', @load_target_id),
    (92002, 'Queen', @load_target_id),
    (92003, 'Smart', @load_target_id),
    (92004, 'Style', @load_target_id),
    (92005, 'Mr.Popular', @load_target_id),
    (92006, 'Ms.Popular', @load_target_id);

-- Six distinct candidates per gender, enough for all three titles per gender.
INSERT INTO candidates (c_id, admin_id, c_name, c_number, c_photo, major_id, c_photo_type, c_gender) VALUES
    (91001, @load_admin_id, 'Boy Candidate 1', 1, NULL, @load_target_id, NULL, 'boy'),
    (91002, @load_admin_id, 'Boy Candidate 2', 2, NULL, @load_target_id, NULL, 'boy'),
    (91003, @load_admin_id, 'Boy Candidate 3', 3, NULL, @load_target_id, NULL, 'boy'),
    (91004, @load_admin_id, 'Boy Candidate 4', 4, NULL, @load_target_id, NULL, 'boy'),
    (91005, @load_admin_id, 'Boy Candidate 5', 5, NULL, @load_target_id, NULL, 'boy'),
    (91006, @load_admin_id, 'Boy Candidate 6', 6, NULL, @load_target_id, NULL, 'boy'),
    (91007, @load_admin_id, 'Girl Candidate 1', 1, NULL, @load_target_id, NULL, 'girl'),
    (91008, @load_admin_id, 'Girl Candidate 2', 2, NULL, @load_target_id, NULL, 'girl'),
    (91009, @load_admin_id, 'Girl Candidate 3', 3, NULL, @load_target_id, NULL, 'girl'),
    (91010, @load_admin_id, 'Girl Candidate 4', 4, NULL, @load_target_id, NULL, 'girl'),
    (91011, @load_admin_id, 'Girl Candidate 5', 5, NULL, @load_target_id, NULL, 'girl'),
    (91012, @load_admin_id, 'Girl Candidate 6', 6, NULL, @load_target_id, NULL, 'girl');

-- status=1 is required by /api/voter/qr/verify, /session, /ballot and /submit.
INSERT INTO completion (major_id, status, year) VALUES (@load_target_id, 1, @load_year);

-- 200 active student voters. token = public_id$HMAC_SHA256(secret, TOKEN_PEPPER)
INSERT INTO voter_info (major_id, role, token, active, vote_weight, voted, submitted) VALUES
    (@load_target_id, 'student', 'load0001$3a48703d4cd25e7543b2fad9b5693884f0938293c1f7818c53e953d7e5a02816', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0002$9cafc46fb186febe4f608d14530ad4c4f367e611dcd3f30b37dc37078a2cf3ac', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0003$5f52e1acce58d18d1f28863734ae06911e14df5544f9cc47f3842137a8459ba6', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0004$b8d0ffa4fab1d5bdcc5b348693af3526df9feaae558f924640f6f897ce333095', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0005$cd4979dcdf666785060542c657b07701f8dca6fad78a845a6657ad708852d10b', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0006$4927343dbf96c44e59cdaa0b6208159ef051ca9a31a1df640f43455c3659908f', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0007$4c1ad929669ff8c5fd6ecfc4b7bc739c825fd9fe035b5ffdd7a477abd8d20b6d', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0008$fcf0a685403df51ec78cf60e358ab8580c5983dc2f36213e800527aa39e932d5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0009$0f4a0b665bb9d32365c1544f6d2d0c98add04507dd309c9624e255a783a5b293', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0010$40d14801f5cc01b77b294d6491384800309e4159dfbae4bb4f91877768de3d2f', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0011$dd8274f43514cc884f617864ac4a67b6f219f3f54da5b0e83ce4170fa22b6b76', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0012$5585d533c3f791cf1f9adba5092f6306a8be6f690ba410c84f80e6366da86eb2', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0013$3dae9fb5dbd065b41c694a9d6ceb97f9f33ec238e260cff00c1fc30cf0be6d30', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0014$b7e89d1295ed8b3a18405187d04e7e27f4da10891f35ca341ab58fe361ad959f', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0015$bb04550193c0c17a8960b7ecc460aaafff0d0b63d6c5f6c4e4a5969d594f4a18', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0016$ebaf111b3c33f0d4959170a49fe41afa67d15a962473b88301eca9eaec08e77b', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0017$f9639cd3f528e1c41aa72e5c91fdb5b0c35753b1fd95112aed0ab2d6c1a2ff93', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0018$20acbc2b305f7a06542b3427a9a46b681771b6aa4e51ebcec8b4452932b29c4a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0019$85e81aa9f1edddf58ac25a224abd069fbe8c779715d17ea9f65487447d9c30a4', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0020$e545adc461bd66930e61154059c9090046e31172a53b5155e5bdbe926566401a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0021$58a56524b1a186243c1a9b7571659eb3aad052d600aff77e873dce889a7efa11', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0022$7a35d99d937b5d6c2157b3d044fe2b740e6e0fcac6cb7b7190d042a6f9116793', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0023$55b469fd31dc962194108e7691134cdc6335121ac174d5aa999eccc55d58fbeb', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0024$9f2cb76dae530974b11d0244dd0787e9c78bdc10749ffea9f65b8e4465a521aa', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0025$d06047fb6fc6f8cb364f70921fa30c61583857cc378f59dc55c96b77d9d08ff9', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0026$5f96173ffe23f58eca347617f13c948b39bec23838af0828d643687c0412d098', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0027$70b8b5ee6fcecb42a2f549bdc5d84e79fd602e1377958c4f811ff530ea44a824', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0028$238e5ac0c6d2e6e514e8f4bab66affeb5dfa1224db739e0ce76f32a000ef2ff8', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0029$aa4dc3d919e6de581100329b2103d5e66b1defced2d1a8462a7a4804859ca2e7', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0030$abcfc4ed89ebed17b7bd210b0cf303ea34e78f040d8f7e183425c90e2325241e', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0031$91dd50682b8571647302583fd4ae4f025a49e1d0918e0da2fd349b1a17c880b3', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0032$1faeeaef3146f59598888de155466c74e17d7888bcb79e528769addff6d49b0e', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0033$f3401022be99780350b02446f0ab474ddf70cf81f15f2c6a38efc1467fa06174', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0034$2e7c04c9e74f7ad90241c52c047bc6cb0da63da8c17a9aa92c6146e73c21f4a2', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0035$71a8f02ffb74f11492649de58e3dd71bf6b3320d1e581eda8a5f60d1d12ad9a5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0036$75f54a417383587af18c89f697fde08b691c05e51cf96719299eebd23bb3ea18', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0037$146e18ee385ece573cf1caf3c6039975bfbb1281ab4c312209d4bbfba7233a99', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0038$8dc2733e8f0ae45a6d9582c12e2a8924173d20967b512059fe0dea3f9359145e', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0039$84d607a6ef41a035a6e3faf1b61e2745a5b8f7d8957b7f1265b20dad94b31219', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0040$87c8f1e5dda78f6e33ff2651c587204ebde679e9fd6fe58fbdd19fc024b31ff2', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0041$acb2d4a0e694da113d50d39fc856cc4ec16e089772a5aba6edcacef411ea26d8', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0042$e60ca2f8271c2e5bca4d4d40390db8c177832e4b5c268a225d71b2722dfa144c', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0043$85ea0ce00542fcd3d6266aa2ca2de60a9b5fb0f078e6b534d38e9337be652702', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0044$7926bfcca9bb9bb11aec177ecf46e22efb2a9654609c5784b3f5c03a7a592b57', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0045$38fd04e2007141c00247095a57dd2123217cacfbf1841ab74018bd0120784054', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0046$0888c27783cba894873fb7abb8145b67f03b55841041f7fa575a2cc7c0ed4926', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0047$d7375738abc3cd729d6e082ca651a76148c4c1a9203451297e23e0d7091426bb', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0048$76b89094ae0649b6dba88b30d82dda3d3df741def66511597bc92a935f005726', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0049$8dbba040a910fc9b48b1e1cd9de9f0d1616a72357f877a9dc9347ccdacfda441', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0050$f1e93781b9823dcdc12c4980202a63728840d1189387ca7b12bae1e6505df588', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0051$92e063c37b73f2ecdc16de494ca3ef1072eeccab8d69598f2654fb0d2a7e3e4f', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0052$f880cb266e61de444ff7bd287a5c354e4d8945edb0d13a14f5b1cc195ba1d836', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0053$56784c223f09ea1bdf658a8789293e5a70cef4482c8e86fbccf7a130c1a124cf', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0054$308b511be3f8bc00ab7eb4b8c4180d92d6e7f1e5df37900f30703351b714effb', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0055$56d6d6243a097e3676f21ea8e29fbda10b54cab536b517146cdf624833cdc51b', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0056$b6408bfd6520a5b8636b8ee3ad35afe483f6157b1e97e5a6f16def28a62dc66d', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0057$5284c160f58a70ca149f6ddb9a2761600144a9218c25093f4d696b363b60ee66', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0058$9cf5fa292047984a7a3ff9a9f3d69bbdb3ba191c3742455386396189731fe2d3', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0059$a8742079e06fd52c14fed3a7c7ac81392fac9efa18ee9f0b2bc9ade3a1a259b7', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0060$0abb1e63112d607d80070056e68f0be81c2b9ab1ac3e5bcae973e39de75e5474', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0061$bd86ffe465fb770e215c6089f4290ccafbd85e4370a0fe85b90714b352d23b62', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0062$27ccae7ae0e233eddea8dc6e654c54ea20ec70cf30b7855c8dbc7829314c9829', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0063$1a43c84a1b72c4d41ee6f3d50036b766edf6afb73cd16e5e086661b53c38050b', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0064$c8fa9e99870e325e6ea41dcf46f1199e8d07c8a2ea194ba14a8dfbf933291526', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0065$692fb0d40fe23f458c304a50226de62c43c08df0e36c26dd54578a9fe8fc6423', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0066$ae557be9a7de0f9d81c99f7590862f2aabf3dc4b79612ababf84b8daac9c660e', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0067$5ba8aca1034456e607ec2e06fcf4bb50abac203bdcc3a4258d31c47fb8ca4666', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0068$d0059701c66094f1c64e04279153614aad7eb93de449dc8b3f2a21652dc957fd', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0069$7f9121feea60caa76583537bbb987959e880891730941246064d2f8417fc9cf2', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0070$1c987cf7fdf9b007698426cd97e5351ae9aed5a7204ee1a4ad742023d4581ebe', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0071$b84b426d82ce00fd398b6cd16c80eefb1c0c470db1f4fd284621cc995c3587fd', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0072$5c3314fcf64c8f3e14788855d2406105b650e96a2ddd032cae315e57f12bf1f3', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0073$b07c7c48c625a31e8dc1cd151415a93add0f5e1a4b3b74c712f28f967586873b', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0074$1f89205e04402e43a0703e8dd00ed7430c76727ae8e162ed502ded4b69671336', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0075$b8db648286f7b3a013af3dde16cdfeb92ba2222f89f60d6dee27b64d23d98ad3', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0076$30e47c0232794d17890dbbbac86fb37ad507d6c2f82e3d3f72d6166b15d5bc9f', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0077$a9c1cc9e2159d0c4ce2a114408a00ddfab89be8bfe3f1a562cc3b381272b5e75', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0078$6196190a5527e6b2d860d879fa9303f21489185b831f6ee3d1321adcfaad872d', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0079$fe9b303407d565db30a1ef095bb3ec0470ebc470ac4373c79192637e1abe2942', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0080$b2fe2953a6f02209823a3a9d24a34e04f19d90d02c46350cb7896fea223722c3', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0081$fd5debfb89750c528c8ec13e281403f5d099582fde8f0d7db4164a088456ed1a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0082$5e455c2ac2ac668bf0ec1ae75501ad2a0903067ec1f6261eb72235eec00c1ce7', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0083$a6ae2856a13f96d1d6a389cc49fd62a275d135996391ad090ee340ea2163c290', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0084$d97218e1f84f7dcd3467119e3dae96a08ef60810801a11eb726f219d46f92278', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0085$077b9e5f51e3338d7dc3940e84b739ca937168add5582e179050d3f964b4500e', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0086$4337c7f406dd6e9cf077a237bc2fa83553b8c545353db166d81c0aabe0e351d2', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0087$3677b553f682bd4a27650f5849551e70633c57b30a16daf2bb80f15a2da7e758', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0088$b1c3d164ba309c61a6bf63fd778308db18f73c3afa975f6670f7a4777aa3390d', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0089$2f86c2315310612f065cc37b88a8972fd7810d8e495cfbe391ff555795ef43a4', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0090$c41da109fcd7e0c3453513d1b74b324cd23972f519abafda26a22b21842168f5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0091$c6b730bb88baabd556ed0d5b62112f418913ddc9fe4f19923de43145074e2cca', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0092$edd3227c8f4b16305552a377365025d3904aa2d9e88c99e47291c37b800f59ce', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0093$7ea78ecce62c22c915ef87ba994d3689d01d051ff16c289129cface44449e54a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0094$763f54993449fdfd2c83ca6b83a3eb6ccd514cb41705ad645301ec2775de9492', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0095$2327ec4cc172b63f1932d79b0a9b72fab4449f4d8cad043373ba428bce2fa292', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0096$48230ef8e884e306b1dc6f6f03065a39a790d92844b6a93f5921a749f8a90f15', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0097$91e7708390fb7bd4eb7e5a43bd96d77d13008afa3e49b75b359fae3801fc35af', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0098$a20f4bb606fb38e657754784a35160d1df019a17aad9ed4580fd139566754c3c', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0099$4ffd859f0fdf7748fd758d5253bcb49d7a193ac484bcc46fd42d4e082c1a0ac6', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0100$2562f34a67c707f25c3289e4e08d7dd46e69f0acfac77f9ec9410b95178125c2', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0101$e4dcf9c13cb963cba35977dd3362864bdb6578c20c7f2b5412cfc41b237231c6', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0102$be1484952d83a083a8b727ce898893cb273aca87866b924a70aa131755c17859', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0103$800713e1ec81071cce8ae3a40584e16cef1d8753a00d2f2676d9fbc4015390a2', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0104$0d7a6b0cd36a8b7a41ba48d4396d18716844b7681fd19ba05e2b8bf6bad0e881', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0105$c2ec9e189ca7fe12a9cbb285e68ea4467cf3513b212f7f9b59b7a275e212d570', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0106$ba5e6aa1eeabda06910c60bba2d82b23916c50f59ab3c1f0672eb44732be16f7', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0107$589ee857a74d2b6679faee25cc975ac295f215818f1189b5c6d0f64392c11783', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0108$d4336e87e0f1fe6da53ea8302aa008a175ec9a110aae8d6e0006e4de0037694f', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0109$d95eb857d91e2a639cb66b950aa002a6b308ecca47300a989f99b6223eda9322', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0110$11de3adb02b3cca3abcab30dd3cb64f151edf651be4620b591893f91ff2ac6a5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0111$2307f9d8dae4802a68e95301bac5baf1a6b22b3312e1e135734a836835d2e24e', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0112$8bf062bb1abd29949e211668dd4328214f8ba6a1637d5ab98d9ec6cefb7b123c', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0113$7a57b4f2127a43cd32f9db06902fd5ada1fd848bbf0eea042ef452cfbeb8f659', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0114$0a3fd6a9ff5b01937c05f802b96a818fbb9d78cd90ad305cb02d50391d394163', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0115$8e808b698d7706fb193dde423fe793674166cb34e75b5e0b6cac287cc1944195', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0116$7f855c17bda8ce8068e1ccb92c7564c140b2b47b3651d65eb8dc4ecd6b2864ad', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0117$bd752b36aaf27e434b36be2df4ae7dcadf06eb6574d741428f0fa112bbef30db', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0118$4b81fbb2648040208a88cdeb661ea54cb6f90f4450b1c6918404670a68c4949b', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0119$43ab85b31ef8569a7fcb8f0eb98ea3a0ea091772c93d934a65b031389994e1a4', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0120$4242346944cb9dafc7f26cda2bb09fd60d3cc6a010c4fe7b08d6ae57e21b67a9', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0121$e5b9d9f54a99c30c2fdf734ea3b3278ef2bbc855cb0ccb2282e89692f968b8b6', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0122$d0bd1900e8a0028912cd70fc5bf1caa27f63d4e28eea2b55bf2b6393368ad789', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0123$5cc3103b3044d8c09f7d7802dfd18665f78cbb13022fd3859a3621ce9cd7e7f8', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0124$f8defcef52c35c0bab30b23c2ca487ea993345214ea7cb3f68db1ec8fd297ceb', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0125$1540bde0607e74f3025c0f63645d2e8b6a8522b4a5c42694d649c7d99e00ba89', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0126$f532d21d8d230530705bddb2db258689a0ee9ba1f692a362c263955087ea3a39', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0127$79083e3dc14241277744b1f4aefee2ca7c1f0c2bfebfe300cb295cafe8e998ee', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0128$2413e3ce8168986b51af0e81ca2770a041c67ee6496eb86937e576bea13c2a47', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0129$b0612d0f764d3a0845950c86d5a343895783b3483ef1579db3af6b2c55390fd1', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0130$07f45aca3a0d4774de4ab2e136067aa15f9961a60d61186333ecb8b475f8c1d9', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0131$f496faa7bbd21db8c687a0c3d51b2456ada8a063ec744c21f44cfb3788c07caf', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0132$2cb7d287c9dbf33fc3cff1d1f7cf24907bc87d1b98db54e1652bdf5baa3004a5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0133$c20236cf2af907b4ec8fb4e43e9cfd1d473da576139392e58c93aefd467b1199', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0134$3bc82237d0d3a63e4796578f773486bd0bf51e853ae321da268f5d73c3b95cbd', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0135$9cf30bba41be17c2ab97d1f90794bbb0980362ec9f06c6bb30efe4a668e56d28', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0136$56c589ad840bd49bc0042c9689ea2df535853572cc041a832c74cc003e2c4e5a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0137$3d536c7f44e957bbf354c099f0d76273568671d1337c8a22fd8ce2c7138b29a6', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0138$3db393d4100a6aba67bc4b6874253f4dfd285f1219ad14342311c10cf9a0b4b0', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0139$2bd7e32d4350c84ea8b5e6ecc19551053811a73f1ad1d1aa42f89c8b62ad53ff', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0140$f5a5889ae01059dde13b78a7f19cc6ebda0fd196a61361cb4ee15ce5126a2274', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0141$81c7ffbd409c4f82393fdc8e5aebaba5b90b560e64dba482e3ced5f58e001b8d', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0142$78f303ab00e49d76010752ed7c4b8b0f82528e7d5b9d28bfd6c9f1912714b7a9', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0143$3af0ee4d6bd9ff2203e418db2291e39b8f43f76b4dc158f588dae76964a7fc21', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0144$fd566b2424c6c65d119487fd7643582c0c861c096efea5992b81f1d7a60983b9', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0145$9a8d5872743d6d4567599ad16bc2f13caf507a92b2e7ea5f525492ba7d9025a6', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0146$6497a67a86a083e844055b2d3dfde3205491dabe4aee87a406a4ab8e223f2e53', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0147$b44d3d4a30fd2c5fd510c1e6e50a30cfca28637db86d85c9d2b2d975780aa813', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0148$f4ae00d164225e759e7371b841868f29def1dec0045e2c54a9539168284d73e8', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0149$bc03717a5325a4725161189d3bb9024a33d61073751ce75e4ce668110002206a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0150$0736ea9255bb07e23447d0cab94d37f7681c349542b3361b3b1d1a7bd8e50ce5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0151$948e0ab32d5a69a442c42dcfb0718d3d4d282ef9eacb29da61737cc03786fa80', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0152$93dc5769a21e3275570fb97e78afe38fc9fa2efe0007dd0e824c86d9051bfe57', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0153$680f1fff77dcea613791aca4f71d0eda3c656c9d1aff88e9fdb286dbda1851e5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0154$4542e2d97bc3a8d3cefabc5b041f1fa30d2c90445123e49de315f02372802bbb', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0155$4e60887612cde132bde384d3b3037e1a27dcb3b38f5bcabb5fa12f88abc16537', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0156$98291e9a3c4939541afe21c3f3f67fc0accb7803797969156bb7a5dc460b6159', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0157$176ecceb87c18b6fda74befc19f489054a03abff33e8d7e376c3807fd8709bc7', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0158$33d3880da6fcac26cc55d19f19833de706f93620eb020600e4de1e50ab309a11', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0159$2c766993ceb2f57e9d7fe4604c348c02b7cb8879d07489111286514b92e92e6d', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0160$6e30011bd2a1f08c4df5edbdf93169fcae00ac68c6350c51e22cd81d9a46e674', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0161$b2287045b0cfe2993ddeb2c83ff5197ba05207bd49eea9e82b39af8c58458341', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0162$77b61c4c3136dbeca64a3f63bdf4cfd856f564026fbd28d81d0f5a131bd9ea91', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0163$6320ef64e2457ce4c2fb6c2f9200929513b67cdb88be622142b973057f086e53', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0164$f7e61b7a2ff8ce547b2989438338552ee5658775bc8e93ddddd50166628e4061', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0165$38dc7470369441df3cdf484620620084b1cccb92e1e3010605c145c3ffbdb61a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0166$1d807b5856fcca1d5509b0b3e050762fc93f7bdc13c995bf702085b7f960ff7c', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0167$eef2b3bb9e3c4a6a4cec6596e3a218b2a26205e2c2d62e976fbf2021e8197b28', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0168$ed0fe7ca48ab6ca54ab85ffd12d089c376691fdcc7ae2d8a0a408b5cea95a865', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0169$f3710caf7c33f1eb32103b681fa5bae95885118b3829800df6746ea17029cc23', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0170$df289e143acf9757c341b6cd96ad62d2209e12dcd015d523e0032632062ef878', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0171$2d24cbce4cb1e6b677040768570442e3aa82df117ec13537902381607201500d', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0172$50f7e25ab2e48763298f877ecadaf415500e2c2438a9bd41d9e80f5e49a4a858', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0173$35fac8995c26f0e1a3fd29420635ad1d5dfa60e9452e21724e1332abc1b306c7', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0174$32853fd173a47ee05d52e110a1bd5af523b9ffac1164c4726f54fd4577a15900', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0175$baddd8da65db222b29cf113b06cd42b753e519c004acbdfa8851c31453b676d3', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0176$cbb62aa44476b73a9ef8a6f751dbec1558106198a66bd7c8d3abc842471fa0b0', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0177$6df72dfc2499579e935b26b6d39a9ca88d1977306e3d1f896d90f105c56b9059', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0178$3e6e2bb87dabea0eb1d50f603bf7237ae4a14444653f5aa7566699217c1674f7', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0179$474abca26940e45dcda6ee1e631ecec4a4d26560334b8106ebc20a097418988e', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0180$bb91df75cb836a38a45182bcc66c2f780ee7bda480f4b118994581bd781c6160', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0181$56525f24bfc93a97f0da6e05e4820f47067c9df6f846f1889c869d2260d9dd3a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0182$a80a05df3ac29c18662fe1eda5d040293c19d394a5774bec5f4567eee8039238', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0183$9cf8ba7262de57f7506bd1bca0edae897abf9744baca6f7e43d0b6e38046984a', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0184$e75ceb527288eecd0b9bd7cb53dafee95761d85caa6ac0c7c550fc8552fc1d06', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0185$dd9c72841a6bc7e0f90a75f4129aa82a1c8930583622dd17a96fa728045f8245', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0186$ddeaf848ca090a975fe0bf91723567682565cb51789b5b994231417aef9716b5', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0187$7c3b2f6d4cf0a1d4cb152b71b48f822efcc57e60628950e12dc8a69ffc9dfc47', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0188$502ecaf236927cf2cdaef90d44fafebd1f0c2e5e16bb02c2dbb30106209c77d1', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0189$30b068120b39aec7874f2c733cc1ea175d7bed37b254d3594aaecd800afaecea', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0190$7339e928f7c288dbd53c34690af43575a8047bf7608a04b1b61702174dd7c559', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0191$1d74b26e803ae820271d2198ba726d2f210337d3529edebb57aaa07e44e6fab6', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0192$0e2ec929b40ea907d47f4acacd35a920f38776c2d3e51b010fd16377832935eb', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0193$9a690dcc0f2186532de015d90184c2f08173348b792f4792a7d95f920b4f2baa', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0194$aff0d1928f4281a951246b693bb24caee0ee07eac1bfd64944d9981bdac05182', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0195$46d8822c3ad1343d168dfc7a37cba106ca4b3e06b95c0a27bb6a8025970ff612', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0196$14a92103b4ad2455a2d3a589123bf0712bcc699447e3881a948edfaee23d4397', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0197$44508ceba47ff821ee77fec0e3fd75c1bd06cd55f6c75b35b46419ed5e8d0a54', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0198$f66b1d245099b6b6d7f0dfcafcb9921b193eca23d81fa2525d39387bc64986b8', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0199$02dd55530c23679487998708ce00019b543599bd7a887a4a9433f49e60f2b0ce', TRUE, 1, FALSE, FALSE),
    (@load_target_id, 'student', 'load0200$0e315274bf0d18a125882fdc89b9f3e7218e9789d1620b1b0b3698800408ded5', TRUE, 1, FALSE, FALSE);

COMMIT;

-- Pre-test checks: expected values are 200 voters, 6 boy + 6 girl, 6 titles, status 1.
SELECT COUNT(*) AS ready_voters FROM voter_info WHERE major_id=@load_target_id AND active=TRUE AND submitted=FALSE;
SELECT c_gender, COUNT(*) AS candidate_count FROM candidates WHERE major_id=@load_target_id GROUP BY c_gender ORDER BY c_gender;
SELECT COUNT(*) AS title_count FROM titles WHERE major_id=@load_target_id;
SELECT major_id, status, year FROM completion WHERE major_id=@load_target_id;
