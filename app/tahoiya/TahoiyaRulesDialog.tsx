import { GameRulesDialog } from "../components/GameRulesDialog";

export function TahoiyaRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <GameRulesDialog open={open} title="たほい屋のルール" onClose={onClose}>
    <p>知らないことばの「本当の意味」を当てるゲームです。本物の説明に、みんなが考えた偽の説明を混ぜます。本物を見抜くだけでなく、自分の偽説明を本物だと思わせても得点できます。</p>
    <h3 className="mt-4 font-black text-white">最初に知っておくこと</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5"><li>お題には、ふだん見かけないことばが選ばれます。最初から意味を知っていなくても問題ありません。</li><li>偽説明は、面白い文章よりも「辞書にありそうな文章」を目指すと、ほかの人をだましやすくなります。</li><li>本物とすべての偽説明は、投票が終わるまで作者を隠して表示されます。</li></ul>
    <h3 className="mt-4 font-black text-white">1ラウンドの流れ</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5"><li>お題のことばと読み方が表示されます。</li><li>説明を書く人は、本物らしく見える偽説明を設定された数だけ入力します。全員が書き終わるまでは、自分の説明を直せます。</li><li>本物の説明と偽説明を、順番を混ぜて一斉に公開します。</li><li>投票する人は、本物だと思う説明を1つ選びます。全員投票モードでは、自分が書いた説明はどれも選べません。</li><li>投票がそろうと、本物、偽説明の作者、誰がどれを選んだか、今回の得点を公開します。</li></ol>
    <h3 className="mt-4 font-black text-white">得点</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5"><li>本物の説明を選んだ人は、1点をもらいます。</li><li>自分が書いた偽説明に1人が投票するたびに、作者が1点をもらいます。</li><li>全員投票モードでは、本物を当てた得点と、偽説明でだました得点の両方をもらえます。</li><li>次のラウンドへ進むと得点は加算され、減点はありません。</li></ul>
    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100"><p className="font-bold">得点の例</p><p className="mt-1">本物を当て、さらに2人があなたの偽説明を選んだ場合は合計3点です。</p></div>
    <h3 className="mt-4 font-black text-white">2つの遊び方</h3>
    <p className="mt-2"><span className="font-bold text-white">回答者1人：</span>1人だけが説明を選び、それ以外の人が偽説明を書きます。</p>
    <p className="mt-2"><span className="font-bold text-white">全員作成・全員投票：</span>全員が偽説明を書いて投票します。自分の偽説明には投票できません。</p>
    <p className="mt-2">部屋設定で、1人あたりの偽説明を1〜3つから選べます。複数にした場合は、すべてが別々の候補として並びます。</p>
    <h3 className="mt-4 font-black text-white">お題の難易度</h3>
    <p className="mt-2"><span className="font-bold text-white">秘境：</span>共通単語DBの実質Zipfが0より大きく3未満の語を使います。</p>
    <p className="mt-2"><span className="font-bold text-white">魔境：</span>実質Zipfが0の、頻度を計測できないほど珍しい語を使います。</p>
    <p className="mt-2">単語を選んだあと、AIが読みと本物の説明を付け、別のAIが内容を確認します。</p>
    <h3 className="mt-4 font-black text-white">時間切れ</h3><p className="mt-2 text-amber-200">偽説明を書かないまま時間が切れると候補に入らず、投票時間が切れた人は未投票のまま採点されます。</p>
  </GameRulesDialog>;
}
