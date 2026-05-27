-- Apple Books でフィクスチャ EPUB を開く skeleton（M2-C）。
--
-- M3 で本格化する。Apple Books はヘッドレス起動できないため、
-- macOS runner 上で GUI を起動し、AppleScript でフィクスチャを開いて
-- スクリーンキャプチャを撮る運用を想定する。
--
-- reader-matrix.yml からは `if: false` 付きで呼ばれており、本体は M3 で実装する。

on run
	log "[apple-books] skeleton — Apple Books integration is scheduled for M3. No-op for now."
end run
