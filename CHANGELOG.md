# Changelog

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
