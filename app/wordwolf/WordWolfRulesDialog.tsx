import { GameRulesDialog } from "../components/GameRulesDialog";

type Props = { open: boolean; onClose: () => void };

export function WordWolfRulesDialog({ open, onClose }: Props) {
  return <GameRulesDialog open={open} title="ワードウルフのルール" onClose={onClose}>
    <p>みんなで似たお題について話し、少し違うお題を渡された「狼」を探すゲームです。たとえば、市民のお題が「うどん」、狼のお題が「そば」のように、話が通じそうで少しだけ違う組み合わせが出ます。</p>
    <h3 className="mt-4 font-black text-white">最初に知っておくこと</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li>多くの人は同じお題を持つ「市民側」、少数の人は別のお題を持つ「狼側」です。</li>
      <li>画面には自分のお題だけが表示され、自分が市民か狼かは表示されません。周りの話を聞いて、自分だけ違う可能性も考えます。</li>
      <li>お題そのものを言うのは禁止です。「食べ物です」のように、直接答えにならない言い方で話します。</li>
    </ul>
    <h3 className="mt-4 font-black text-white">1ゲームの流れ</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5">
      <li>自分だけに表示されるお題を確認します。</li>
      <li>順番に、お題について短く話します。設定された周回数だけ全員の発言を繰り返します。</li>
      <li>設定された回数の会話が終わったら、狼だと思う人へ1票を入れます。</li>
      <li>最も多く票を集めた人が選ばれます。最多票が同じなら、その人たちがもう一度話し、対象をしぼった決選投票をします。</li>
    </ol>
    <h3 className="mt-4 font-black text-white">勝敗の決まり方</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li>投票で狼ではない人を選んだ場合は、狼側の勝ちです。</li>
      <li>投票で狼を選んでも、まだ市民側の勝ちは決まりません。選ばれた狼が市民のお題を完全に当てると、狼側の逆転勝ちです。</li>
      <li>選ばれた狼が市民のお題を外すか、回答時間が切れると、市民側の勝ちです。</li>
    </ul>
    <h3 className="mt-4 font-black text-white">得点</h3>
    <p className="mt-2">1ゲームごとに、勝った側のプレイヤー全員へ1点が入ります。負けた側は0点で、減点はありません。同じ部屋でもう一度遊ぶと得点を引き継ぐため、何ゲーム勝ったかを比べられます。</p>
    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100"><p className="font-bold">例</p><p className="mt-1">市民が狼を選び、狼の逆転回答も外れた場合は、市民全員が+1点、狼は0点です。狼が投票を逃れた場合や逆転に成功した場合は、狼全員が+1点です。</p></div>
    <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3"><summary className="cursor-pointer font-bold text-slate-200">「狼なしの可能性あり」の部屋</summary><p className="mt-3 text-slate-300">10%の確率で狼がおらず、全員に同じお題が配られます。この場合は、投票で選ばれた人だけが負けて0点、ほかの全員が勝って1点です。全員が同じ票数なら、もう1周話してから再投票します。</p></details>
    <h3 className="mt-4 font-black text-white">時間切れ</h3>
    <p className="mt-2 text-amber-200">発言時間が切れると、その人の番を終えて次へ進みます。投票や逆転回答の時間が切れた場合も、サーバーがその時点の内容で進めます。発言内容を全員へ見せる時期は、部屋の設定で変わります。</p>
  </GameRulesDialog>;
}
