import { GameRulesDialog } from "@/app/components/GameRulesDialog";

export function HodoaiRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <GameRulesDialog open={open} title="ワードスケールのルール" onClose={onClose}>
    <p>みんなで力を合わせる協力ゲームです。全員に0〜120の秘密の数字が配られます。その数字を直接言わず、お題に合うことばで伝え、最後に全員のカードを数字の小さい順へ並べます。</p>
    <h3 className="mt-4 font-black text-white">ゲームの準備</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5"><li>ホストが、1人に配るカードの枚数と、同じ数字についてことばを出す回数を決めます。</li><li>ゲーム開始時に、全員へ0〜120の異なる数字を配ります。自分の数字だけを見ることができ、ほかの人の数字は最後まで見えません。</li><li>最後にカードを動かす「並べ替え役」は、ゲーム開始時に参加者からランダムで1人選ばれます。</li></ul>
    <h3 className="mt-4 font-black text-white">ことばを出す</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5"><li>全員に同じお題が表示されます。お題には「0側」と「120側」の意味も書かれています。</li><li>自分の数字がそのお題なら何に近いかを考え、カード1枚につき短いことばを1つ入力します。カードが複数ある場合は、全部をまとめて提出します。</li><li>数字そのもの、「真ん中くらい」「100に近い」のような数の直接説明は禁止です。</li><li>設定回数が2回以上なら、同じ数字のままお題だけを変えます。別のお題で出したことばも、最後の並べ替えの手がかりになります。</li></ol>
    <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-100"><span className="font-bold">例：</span>お題が「休憩中にうれしい食べ物」で、自分の数字が120に近いなら「大好物のケーキ」、0に近いなら「あまり好きではない野菜」のように表します。</div>
    <h3 className="mt-4 font-black text-white">最後の並べ替え</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5"><li>全員のことばがそろうと、すべてのカードを公開します。秘密の数字はまだ見えません。</li><li>全員で相談し、数字が小さいと思うカードから大きいと思うカードの順に並べます。実際にカードを動かせるのは並べ替え役だけです。</li><li>並べ替え役は自分の秘密の数字を確認しながら操作できます。順番を確定すると全数字を公開し、採点します。</li></ol>
    <h3 className="mt-4 font-black text-white">得点</h3>
    <p className="mt-2">個人の得点ではなく、チーム全員で1つの得点を取ります。正解の順番と比べて、前後が反対になったカードの組み合わせを数えます。</p>
    <ul className="mt-2 list-disc space-y-2 pl-5"><li>反対の組み合わせが0組：3点</li><li>1組：2点</li><li>2〜3組：1点</li><li>4組以上：0点</li></ul>
    <p className="mt-2">たとえば正解が「10・50・90」なのに「10・90・50」と並べた場合、90と50の1組だけが反対なので2点です。ことばを何回出す設定でも、最後の採点は1回だけで、1ゲームの最高点は3点です。</p>
    <h3 className="mt-4 font-black text-white">時間切れ</h3><p className="mt-2 text-amber-200">ことばを出す時間が切れると、そのカードはその回だけ「パス」になります。並べ替え時間が切れると、その時点で保存されている順番を自動で採点します。</p>
  </GameRulesDialog>;
}
