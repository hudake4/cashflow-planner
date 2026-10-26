# Changelog

## [0.23.0](https://github.com/hudake4/cashflow-planner/compare/v0.22.1...v0.23.0) (2026-10-26)


### Features

* **cards:** track credit cards - balances, due dates, estimated bill (issue [#61](https://github.com/hudake4/cashflow-planner/issues/61)) ([d1152a3](https://github.com/hudake4/cashflow-planner/commit/d1152a3cff1be7644fd5430c52ebe1ce81243a9d))
* **cards:** track credit cards (issue [#61](https://github.com/hudake4/cashflow-planner/issues/61)) ([f8e6885](https://github.com/hudake4/cashflow-planner/commit/f8e6885fd8871033f014ab9da98677d31b9d697e))
* close issues [#40](https://github.com/hudake4/cashflow-planner/issues/40), [#41](https://github.com/hudake4/cashflow-planner/issues/41), [#47](https://github.com/hudake4/cashflow-planner/issues/47), [#49](https://github.com/hudake4/cashflow-planner/issues/49), [#50](https://github.com/hudake4/cashflow-planner/issues/50), [#53](https://github.com/hudake4/cashflow-planner/issues/53) ([14b3bd6](https://github.com/hudake4/cashflow-planner/commit/14b3bd699b3caf7c7b4480c62a081b63017ec4b7))
* implement issue [#40](https://github.com/hudake4/cashflow-planner/issues/40) ([ea6d113](https://github.com/hudake4/cashflow-planner/commit/ea6d113dec4c797ca350c48d5cb59a84781c8115))
* implement issue [#41](https://github.com/hudake4/cashflow-planner/issues/41) ([5e0fe6c](https://github.com/hudake4/cashflow-planner/commit/5e0fe6c08624742c32a9c44c91cbabf760825f8c))
* implement issue [#47](https://github.com/hudake4/cashflow-planner/issues/47) ([91059e6](https://github.com/hudake4/cashflow-planner/commit/91059e69a1783c5f3d949b60a982d645193516cd))
* implement issue [#49](https://github.com/hudake4/cashflow-planner/issues/49) ([6677042](https://github.com/hudake4/cashflow-planner/commit/6677042ee62853e35551aeb46b95e7cd1d1088d5))
* implement issue [#50](https://github.com/hudake4/cashflow-planner/issues/50) ([72cc259](https://github.com/hudake4/cashflow-planner/commit/72cc2598fab9328898efd0265f2b1e9c1812e44a))
* implement issue [#53](https://github.com/hudake4/cashflow-planner/issues/53) ([218baec](https://github.com/hudake4/cashflow-planner/commit/218baecbab3075b21b4b19e253ba0da91318b6af))

## [0.22.1](https://github.com/hudake4/cashflow-planner/compare/v0.22.0...v0.22.1) (2026-10-26)


### Bug Fixes

* **institutions:** write the middle-dot separator as an escape ([3b2f43f](https://github.com/hudake4/cashflow-planner/commit/3b2f43f90590f7b14561707908bd7b037ab885ea))
* **institutions:** write the middle-dot separator as an escape ([fb4fdc5](https://github.com/hudake4/cashflow-planner/commit/fb4fdc5d8ba27b71d4d9f30da5b5e03378fefc19))

## [0.22.0](https://github.com/hudake4/cashflow-planner/compare/v0.21.0...v0.22.0) (2026-10-26)


### Features

* **spending:** show transfers as a category row in the spend analyzer ([d868a0c](https://github.com/hudake4/cashflow-planner/commit/d868a0cbf05aee456c1c39773d70e97700a224c0))
* **spending:** show transfers as a category row in the spend analyzer ([080fe15](https://github.com/hudake4/cashflow-planner/commit/080fe158cfe964e7f3cba3b8fc70e1cb66c0d049))


### Bug Fixes

* **institutions:** hide zero Available balance on credit and loan accounts ([c08c2fd](https://github.com/hudake4/cashflow-planner/commit/c08c2fd1cdd1e13020bb8160ce968a1fe292c3dd))
* **institutions:** hide zero Available balance on credit and loan accounts ([a820e97](https://github.com/hudake4/cashflow-planner/commit/a820e97447ea8887b08da79d073009d9f5f7f9ee))
* **institutions:** keep available balance narrowed for typecheck ([4618db3](https://github.com/hudake4/cashflow-planner/commit/4618db38f37b64278db84ebd57a0fe35a077cd36))
* **spending:** keep the Transfers row's category literal typed ([7923b77](https://github.com/hudake4/cashflow-planner/commit/7923b775eec4f9aed2358401a37d1d5f515af0dd))
* **spending:** restore en dashes corrupted during conflict resolution ([2e1a2c7](https://github.com/hudake4/cashflow-planner/commit/2e1a2c72b4f9522c1fbeb5192f17f45e7d859459))

## [0.21.0](https://github.com/hudake4/cashflow-planner/compare/v0.20.0...v0.21.0) (2026-10-25)


### Features

* **ui:** give each institution account its own card ([087db0c](https://github.com/hudake4/cashflow-planner/commit/087db0c0f7972051f2113fd85bd0f02d7adfe5bd))
* **ui:** give each institution account its own card ([e78db2c](https://github.com/hudake4/cashflow-planner/commit/e78db2cc0addc22dc734135d39a142c91d1d2596))

## [0.20.0](https://github.com/hudake4/cashflow-planner/compare/v0.19.0...v0.20.0) (2026-10-25)


### Features

* desktop notifications for low balance and upcoming bills ([98546b5](https://github.com/hudake4/cashflow-planner/commit/98546b55745c40e9fda0f98759d0838dba8d2cf9))
* **desktop:** add a setting to turn notifications off ([22e0869](https://github.com/hudake4/cashflow-planner/commit/22e08690c46a5cc337a2f3e8e2b74aae70989710))
* **desktop:** notify about low balance and bills due soon ([0891af1](https://github.com/hudake4/cashflow-planner/commit/0891af1ed632794e0cb19af2bf0b58782b8050bd)), closes [#51](https://github.com/hudake4/cashflow-planner/issues/51)
* suggest variable-bill amounts from bank history ([22ca1a7](https://github.com/hudake4/cashflow-planner/commit/22ca1a7bb170633926fba2edf4eef7cec0c61a17))
* suggest variable-bill amounts from bank history ([34dd668](https://github.com/hudake4/cashflow-planner/commit/34dd6687ff5088878d0d8c1943c06e6f04033a54)), closes [#43](https://github.com/hudake4/cashflow-planner/issues/43)


### Bug Fixes

* **bank:** make recurring scan and spending aware of credit cards ([e716530](https://github.com/hudake4/cashflow-planner/commit/e716530f2c2e3f624e69c90ed77b917ad318f344))
* **bank:** make recurring scan and spending aware of credit cards ([acc8755](https://github.com/hudake4/cashflow-planner/commit/acc87553fc2f9b9e575d1991aa81ba4276e442b5))
* **ui:** make estimate Use button visibly a button ([0db12f6](https://github.com/hudake4/cashflow-planner/commit/0db12f6b410566cb320430f4f74345cdf28c0099))

## [0.19.0](https://github.com/hudake4/cashflow-planner/compare/v0.18.0...v0.19.0) (2026-10-25)


### Features

* **bills:** offer to mark bills paid when a synced bank transaction matches ([81b7e9e](https://github.com/hudake4/cashflow-planner/commit/81b7e9ec782dc19f892ba55233b519b5cb85d636))
* **bills:** offer to mark bills paid when a synced bank transaction matches ([bc7a13b](https://github.com/hudake4/cashflow-planner/commit/bc7a13bacce34ae32c7eee44153c95b7273b5b7f))
* **simplefin:** encrypt the stored Access URL at rest ([cbe2b9c](https://github.com/hudake4/cashflow-planner/commit/cbe2b9c606ac5ba950482e919032c044e0f0f18a))
* **simplefin:** encrypt the stored Access URL at rest ([2be24b5](https://github.com/hudake4/cashflow-planner/commit/2be24b5bf739fdf116ec52ce38f84ff35be5fee9))

## [0.18.0](https://github.com/hudake4/cashflow-planner/compare/v0.17.0...v0.18.0) (2026-10-25)


### Features

* **settings:** restore data from a backup file ([545cf8e](https://github.com/hudake4/cashflow-planner/commit/545cf8e4b7dc59f3919f93a71e436f9ee06a4b9d))
* **settings:** restore data from a backup file ([7129d73](https://github.com/hudake4/cashflow-planner/commit/7129d73fa90806cee6c5349c62491b44afcaf17f))


### Bug Fixes

* **settings:** accept backups from older app versions ([6ee094f](https://github.com/hudake4/cashflow-planner/commit/6ee094f1011cbcd24b9154949a9e6177476b725c))
* **ui:** remove inherited negative margins from dialog footer ([98eff35](https://github.com/hudake4/cashflow-planner/commit/98eff35c1e79df87226f9d137a7b49d4bee3dd0f))
* **ui:** remove inherited negative margins from dialog footer ([38fc273](https://github.com/hudake4/cashflow-planner/commit/38fc273ecd6b7382b23f776b142e77a9892fce15))

## [0.17.0](https://github.com/hudake4/cashflow-planner/compare/v0.16.0...v0.17.0) (2026-10-25)


### Features

* **settings:** start projection at the oldest bank balance date when balances come from accounts ([d2b05b8](https://github.com/hudake4/cashflow-planner/commit/d2b05b839e3652066d008a82434f414af5182617))
* **settings:** start the projection at the bank balance date when balances come from accounts ([37e1d3d](https://github.com/hudake4/cashflow-planner/commit/37e1d3dfc1748e8f98b0815c5f8b30f9a4dcc2a4))


### Bug Fixes

* **settings:** ignore stale bank accounts when choosing the projection start date ([6b8c9e2](https://github.com/hudake4/cashflow-planner/commit/6b8c9e298be372a4bad8c5ee20c3d30e401e5e9d))
* **settings:** say how to clear stale accounts and mention the one-week rule in the start date note ([dd51c86](https://github.com/hudake4/cashflow-planner/commit/dd51c861d92d5cb1a2ee09cfaf6f2e6a3fe7aa69))

## [0.16.0](https://github.com/hudake4/cashflow-planner/compare/v0.15.0...v0.16.0) (2026-10-25)


### Features

* **spending:** drill into a category to see and recategorize its transactions ([7f68885](https://github.com/hudake4/cashflow-planner/commit/7f6888527affb50a81449281ded0a928941f55b0))
* **spending:** drill into a category to see and recategorize its transactions ([06eadd4](https://github.com/hudake4/cashflow-planner/commit/06eadd4f30754d58c8be36dc6d0cf148b9233590))


### Bug Fixes

* **calendar:** announce negative balances and dip warning in week header label ([ac5ecd5](https://github.com/hudake4/cashflow-planner/commit/ac5ecd53c00f697795853adfb3d06443f79ba785)), closes [#21](https://github.com/hudake4/cashflow-planner/issues/21)
* **calendar:** announce the week's net in the week header label ([4b66326](https://github.com/hudake4/cashflow-planner/commit/4b663261cd944264c81b1d07254a79a35399271c)), closes [#21](https://github.com/hudake4/cashflow-planner/issues/21)
* **calendar:** clear jump-to-date input when the calendar moves ([e1e572b](https://github.com/hudake4/cashflow-planner/commit/e1e572b24b3ce8892aedb5dd8898977e64a17fa5))
* **calendar:** document touch-target exception and recover width for phone heatmap cells ([25d7cc8](https://github.com/hudake4/cashflow-planner/commit/25d7cc850ea41cd796cc4bf73372256f6b62860a))
* **calendar:** fit heatmap balance text inside narrow cells ([cd0e495](https://github.com/hudake4/cashflow-planner/commit/cd0e495913d696ee7d81c4de0fce931a24a29641))
* **calendar:** hide fully pre-start heatmap weeks on phones ([4ef1a5c](https://github.com/hudake4/cashflow-planner/commit/4ef1a5ca2bb021413d776686f1af246c3259f37f))
* **calendar:** hide register column headings when no week is listed ([8724028](https://github.com/hudake4/cashflow-planner/commit/87240282f0bda72c3f107d3fbed335ac87f34187)), closes [#25](https://github.com/hudake4/cashflow-planner/issues/25)
* **calendar:** keep the alert icon off the heatmap cell edge at 320px ([8262438](https://github.com/hudake4/cashflow-planner/commit/8262438d04e61efaf53434c85261bc8237610462)), closes [#20](https://github.com/hudake4/cashflow-planner/issues/20)
* **calendar:** keep wide currency symbols inside heatmap cells ([5362f3d](https://github.com/hudake4/cashflow-planner/commit/5362f3dc95f4bd9d230bedcad4d4b8f7ae5a7e40)), closes [#20](https://github.com/hudake4/cashflow-planner/issues/20)
* **calendar:** quiet zero income and bills in the week header ([425f6a2](https://github.com/hudake4/cashflow-planner/commit/425f6a21d121013c42cb2d95e4fa2fca5c3ffab9)), closes [#24](https://github.com/hudake4/cashflow-planner/issues/24)
* **calendar:** resolve calendar issues [#20](https://github.com/hudake4/cashflow-planner/issues/20)-[#28](https://github.com/hudake4/cashflow-planner/issues/28) ([47dba61](https://github.com/hudake4/cashflow-planner/commit/47dba618beba897920d379ec0698e80309ea93f0))
* **calendar:** show one out-of-range message instead of two ([a94137b](https://github.com/hudake4/cashflow-planner/commit/a94137bc91ad2ae4a9c3cc598618b73a9b095ed0)), closes [#25](https://github.com/hudake4/cashflow-planner/issues/25)
* **calendar:** use one week label across register header and drawer ([e8c2c79](https://github.com/hudake4/cashflow-planner/commit/e8c2c79ae81b54080c304b66a81a100e5bfbc603)), closes [#23](https://github.com/hudake4/cashflow-planner/issues/23)

## [0.15.0](https://github.com/hudake4/cashflow-planner/compare/v0.14.0...v0.15.0) (2026-10-24)


### Features

* **calendar:** balance heatmap with weekly register ([39d33ad](https://github.com/hudake4/cashflow-planner/commit/39d33adf4426b29d22ab8a1e53e4d92abdbc8585))
* **calendar:** balance heatmap with weekly register ([2ce2338](https://github.com/hudake4/cashflow-planner/commit/2ce2338cb1f18b1687da3a79c37c50d969e5288c))

## [0.14.0](https://github.com/hudake4/cashflow-planner/compare/v0.13.1...v0.14.0) (2026-10-24)


### Features

* **schedule:** sort bills and income by clicking column headers ([cee345e](https://github.com/hudake4/cashflow-planner/commit/cee345e08f05df19a89978a2b9172dacb440cc5d))
* **schedule:** sort bills and income by clicking column headers ([9796864](https://github.com/hudake4/cashflow-planner/commit/97968647e2adff75b1d6f451550b93cf2391e70f))
* **ui:** clarify action hierarchy and recurring suggestions ([e7e9988](https://github.com/hudake4/cashflow-planner/commit/e7e99885a3a8cec81d63ea58c210779914239642))
* **ui:** refine check-register UI and add conventions ([9180675](https://github.com/hudake4/cashflow-planner/commit/91806757426e9add8d0c4c439b3038ad54391ae9))
* **ui:** simplify dashboard and calendar ledger summaries ([dedcd6f](https://github.com/hudake4/cashflow-planner/commit/dedcd6fbe1877237102552a2a0098c6fc1c187a0))


### Bug Fixes

* **a11y:** restore focus when controlled dialogs close ([18b4093](https://github.com/hudake4/cashflow-planner/commit/18b4093f6627ceb1a1fc8fe51c15ba1e68722f23))
* **dialog:** keep keyboard-focused fields fully visible in dialogs ([e8ae08f](https://github.com/hudake4/cashflow-planner/commit/e8ae08fbe7b03f37fd9fd5514dae2f39e003a2cb))
* **dialog:** restore focus per instance across dismissal and handoff ([ea117fc](https://github.com/hudake4/cashflow-planner/commit/ea117fcd6b8f2bd4c0d049d6ddbb6f5e6cd28867))
* **ui:** field contrast, input boundaries and 44px mobile targets; guard Button asChild loading ([2e7f82f](https://github.com/hudake4/cashflow-planner/commit/2e7f82f3d887f42eef018d329f6fa404e58a545e))
* **ui:** give mobile switches a 44px hit area ([89e4d5f](https://github.com/hudake4/cashflow-planner/commit/89e4d5f65114fa03e437b1ad9578fa52c7cd5d0b))
* **ui:** keep field validation inline ([38884b1](https://github.com/hudake4/cashflow-planner/commit/38884b18d74a846b73d88a14e895fbbd56445400))
* **ui:** make empty dashboard calendar action secondary ([824f486](https://github.com/hudake4/cashflow-planner/commit/824f48647fa92a0f5c5f198a21434817bf26ad6c))
* **ui:** refine shared chrome and surface tokens ([c4487a6](https://github.com/hudake4/cashflow-planner/commit/c4487a64f2ccf1e9568ba4a95d0cf0e64e221b13))
* **ui:** support Button asChild links with loading state ([0fcb764](https://github.com/hudake4/cashflow-planner/commit/0fcb764e95f09747e312b7bbb14798de4569400c))
