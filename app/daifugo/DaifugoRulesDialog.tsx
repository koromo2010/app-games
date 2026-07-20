import { GameRulesDialog } from "@/app/components/GameRulesDialog";

export function DaifugoRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
