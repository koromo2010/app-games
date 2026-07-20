"use client";

import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";

export function DaifugoRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useAppLocale();
  if (locale === "en") return <GameRulesDialog open={open} title="Daifugo Rules" onClose={onClose}>
    <div className="space-y-5">
      <section><h3 className="font-black text-white">What is Daifugo?</h3><p>Three to six players take turns playing cards stronger than the table. Empty your hand before everyone else. CPU Practice pits you against three CPU players.</p></section>
      <section><h3 className="font-black text-white">Setup</h3><p>Deal a 53-card deck containing one joker. The holder of the 3 of diamonds starts, and the first play must include that card.</p></section>
      <section><h3 className="font-black text-white">On your turn</h3><ul className="list-disc space-y-1 pl-5"><li>Ranks run from 3, 4, 5 … K, A, 2, then joker.</li><li>On an empty table, play one card or up to four cards of the same rank.</li><li>Otherwise, play the same number of cards at a higher rank.</li><li>You may pass. When everyone else passes, the table clears and the last player to play leads.</li><li>A lone joker is strongest. In a set it substitutes for the set’s rank.</li></ul></section>
      <section><h3 className="font-black text-white">Finishing order</h3><p>The first player out is Daifugo, followed by Fugo, Himin, and Daihinmin. Each game records finishing order rather than points.</p></section>
      <section><h3 className="font-black text-white">Rules not yet included</h3><p>Revolution, eight-cut, suit lock, 3 of spades against joker, demotion, and card exchange are not implemented yet. They can be added as room options after the base game is stable.</p></section>
      <section><h3 className="font-black text-white">Turn timeout</h3><p>Online rooms may set a turn timer. On timeout, the game passes if cards are on the table; on an empty table it automatically plays the weakest legal set. Set the timer to zero for no limit. CPU Practice has no timer.</p></section>
    </div>
  </GameRulesDialog>;
  return <GameRulesDialog open={open} title="大富豪のルール" onClose={onClose}>
    <div className="space-y-5">
      <section><h3 className="font-black text-white">何をするゲーム？</h3><p>3〜6人で場より強いカードを順番に出し、誰より早く手札をなくすゲームです。CPU練習では、あなた1人とCPU3人で遊べます。</p></section>
      <section><h3 className="font-black text-white">準備</h3><p>ジョーカー1枚を加えた53枚を配ります。ダイヤの3を持つ人から始まり、最初だけ必ずダイヤの3を含めて出します。</p></section>
      <section><h3 className="font-black text-white">1回の流れ</h3><ul className="list-disc space-y-1 pl-5"><li>カードの強さは、3、4、5…K、A、2、ジョーカーの順です。</li><li>場が空なら、1枚または同じ数字の組を最大4枚まで出せます。</li><li>場にカードがあれば、同じ枚数で、より強い数字の組だけを出せます。</li><li>出せない、または出したくないときはパスします。ほかの全員がパスすると場が流れ、最後に出した人から始めます。</li><li>ジョーカーは単独なら最強。同じ数字の組に混ぜると、その数字の代わりになります。</li></ul></section>
      <section><h3 className="font-black text-white">順位と終了</h3><p>最初に手札をなくした人が大富豪、次が富豪、その次が貧民、最後が大貧民です。得点はなく、1ゲームごとに順位を決めます。</p></section>
      <section><h3 className="font-black text-white">今回まだ入っていないルール</h3><p>革命、8切り、しばり、スペ3返し、都落ち、カード交換は未実装です。基本ルールを安定させた後、設定で追加できるようにします。</p></section>
      <section><h3 className="font-black text-white">時間切れ</h3><p>オンライン部屋では1手の制限時間を設定できます。場にカードがあれば自動でパスし、場が空なら出せる中で最も弱いカードの組を自動で出します。0秒なら制限なしです。CPU練習に時間制限はありません。</p></section>
    </div>
  </GameRulesDialog>;
}
