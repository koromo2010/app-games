const labels = {
  rock: "✊ グー",
  scissors: "✌️ チョキ",
  paper: "✋ パー",
};
const beats = { rock: "scissors", scissors: "paper", paper: "rock" };
const status = document.querySelector("[data-game-status]");
const result = document.querySelector("[data-game-result]");
const resultLabel = document.querySelector("[data-result-label]");
const reset = document.querySelector("[data-game-action=reset]");
const buttons = [...document.querySelectorAll("[data-player][data-choice]")];
const hands = [
  document.querySelector("[data-player-hand='0']"),
  document.querySelector("[data-player-hand='1']"),
];
let choices = [null, null];

function outcome(first, second) {
  if (first === second) return "引き分け";
  return beats[first] === second ? "PLAYER 1 の勝ち" : "PLAYER 2 の勝ち";
}

function render() {
  const complete = choices.every(Boolean);
  hands.forEach((hand, player) => {
    if (complete) hand.textContent = labels[choices[player]];
    else if (choices[player]) hand.textContent = "選択済み（公開待ち）";
    else hand.textContent = "未選択";
  });
  buttons.forEach((button) => {
    const player = Number(button.dataset.player);
    button.disabled = complete || Boolean(choices[player]) || (player === 1 && !choices[0]);
    button.classList.toggle("is-selected", complete && button.dataset.choice === choices[player]);
  });
  if (complete) {
    status.textContent = "両者が選択しました。手と結果を公開します。";
    resultLabel.textContent = outcome(choices[0], choices[1]);
    result.hidden = false;
  } else if (choices[0]) {
    status.textContent = "PLAYER 1 は選択済み。PLAYER 2 の手を選んでください。";
    result.hidden = true;
  } else {
    status.textContent = "PLAYER 1 の手を選んでください";
    result.hidden = true;
  }
}

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const player = Number(button.dataset.player);
    if (button.disabled || choices[player]) return;
    choices[player] = button.dataset.choice;
    render();
  });
});

reset.addEventListener("click", () => {
  choices = [null, null];
  resultLabel.textContent = "";
  render();
});

render();
