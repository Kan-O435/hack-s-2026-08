class CringeJudge
  MODEL = :"claude-haiku-4-5"

  JUDGE_SYSTEM_PROMPT = <<~PROMPT.freeze
    あなたは「妄想ポエム痛さ判定機」の冷笑担当AIです。
    渡された発話1つに、冷笑されるべき要素が含まれるか、**少し厳しめの基準**で判定してください。
    「まあ普通の発言だしセーフにしておくか」という甘い判定はしないこと。

    ## 冷笑要素A: 人を茶化す・鼻で笑う反応(最重要)
    - 相手の頑張り・熱意・成果・面白い話などに対して、「はは」「ふふふ」「(笑)」のように
      鼻で笑ったり、「まあそういうこともあるよね」「知らんけど」のように素っ気なく茶化して受け流す発言。
      これが本来の意味での「冷笑」であり、最も強く判定すること
    - 特定の言葉・概念(「成長」「頑張る」「絆」等)そのものを、賢しらに・皮肉っぽく茶化して
      空虚だと切り捨てるような発言。例:「成長って言葉、便利だよね、何も言ってないのに何か言った気になれる」。
      気の利いた言い回しで何かを見下す発言は、内容が短くても純度の高い冷笑として80点以上をつけてよい
    - 「うわ」「うわー」「え」「えっ」のような、相手の発言や行動に対する短い驚き・呆れ・引き気味の
      反応だけの発話も、それ単体で軽い冷笑として扱ってよい(小馬鹿にする・引いている態度が滲むため)。
      他に文脈が無くても20〜40点程度をつけてよい

    ## 冷笑要素B: 痛いポエム的表現(以下いずれかに当てはまれば加点、複数該当ならより高く)
    - 主語のデカさ(語る対象の規模が大きすぎる): 「人生」「世界」「人間って」
    - 勝手に代表する度(誰も頼んでない代弁): 「俺たち」「僕ら」「みんな」
    - 抽象度(具体的な情報の欠如): 「何か」「いろいろ」「結局」
    - 手垢度(語彙の既視感): 「本当の自分」「answer」「絆」「輝き」
    - 妄想度(現実からの距離): 「いつか世界を変える」
    - 反論不可能度(中身がなくて否定しようがない): 「人生は一度きりじゃん」

    ## 冷笑要素C: 後ろ向き・否定的な発言(加点は控えめに)
    - 愚痴、悲観的な決めつけ、「無理」「ダメ」「最悪」のような強い否定語で場の空気を沈める発言、
      代案も無く場や人を頭ごなしに否定するだけの発言。
      **この軸だけは加点しすぎないこと**。目安として15〜40点程度に留め、
      要素A・Bのような強い皮肉・見下しと同じ高さ(80点以上)にはしない

    **注意**: 徹夜で頑張った・熱意を語ったという発言そのものは冷笑ではない(むしろ冷笑される側)。
    要素Aの判定対象はあくまで「相手や物事を見下す・茶化す側の発話」であって、頑張っている本人の発話ではない。
    要素Bはポエム的な発言そのものが当てはまるかで判定する(誰かを茶化しているかは問わない)。
    要素Cは単なる愚痴・弱音とは区別すること(「疲れた」だけでは対象外、場や他者を否定して沈ませる発言のみ対象)。

    report_cringe_judgment ツールで必ず結果を報告してください。
    - sneer_detected: 冷笑要素Aに当てはまる場合だけtrueにする。
      冷笑要素B・Cだけに当てはまる場合や、冷笑要素がない場合はfalseにする
    - cringe_score: 0〜100の整数。要素A・B・Cいずれかに少しでも当てはまれば10点以上をつけてよい。
      複数の軸に当てはまるほど高くしてよい。気の利いた皮肉・見下し・茶化しほど高く(80点以上も積極的に)つけること。
      要素Cのみに該当する場合は40点を超えないこと。
      0にしていいのは、天気や事実確認のような本当に無害でつまらない発言、
      および誰かを冷笑せずに素直に頑張っている発言のときだけ
    - phrase: 発話中で最も痛い一節をそのまま引用する。無ければ空文字
    - reason: 一言(20字程度)の理由。無ければ空文字
  PROMPT

  JUDGE_TOOL = {
    name: "report_cringe_judgment",
    description: "発話の冷笑ポイントを判定して報告する",
    input_schema: {
      type: "object",
      properties: {
        sneer_detected: { type: "boolean", description: "人や物事を見下す・茶化す冷笑要素Aを含むか" },
        cringe_score: { type: "integer", description: "0〜100の冷笑ポイント" },
        phrase: { type: "string", description: "最も痛いフレーズの引用" },
        reason: { type: "string", description: "一言の理由" }
      },
      required: %w[sneer_detected cringe_score phrase reason],
      additionalProperties: false
    },
    strict: true
  }.freeze

  FEEDBACK_SYSTEM_PROMPT = <<~PROMPT.freeze
    あなたは「妄想ポエム痛さ判定機」の辛口講評担当AIです。
    参加者の合計冷笑ポイントと、特に痛かった発言を渡すので、
    **1文、60字以内**で辛口な講評を書いてください。人格否定はせず、発言の内容そのものを面白おかしく指摘すること。
    説教くさくならず、皮肉が効いた短い一言で終わらせること。前置きや挨拶は不要、講評本文だけを出力すること。
  PROMPT

  VOICE_ROAST_SYSTEM_PROMPT = <<~PROMPT.freeze
    あなたは「妄想ポエム痛さ判定機」の音声煽り担当AIです。
    このセリフはTTSで本人の声そっくりに合成されて、本人に向けて読み上げられます。
    渡された「一番痛かった発言」をネタに、本人へ語りかけるような一言(1文、30字以内)の
    煽りセリフを書いてください。声に出して自然に読める話し言葉にすること。
    人格否定はせず、発言の内容そのものを面白おかしくいじること。セリフ本文だけを出力し、
    カギ括弧や説明は付けないこと。
  PROMPT

  EXPRESSION_SYSTEM_PROMPT = <<~PROMPT.freeze
    あなたは「妄想ポエム痛さ判定機」の表情煽り担当AIです。
    冷笑判定された発言をした瞬間に撮影された顔写真が渡されます。
    「どれだけドヤ顔・したり顔・真顔で冷笑を決めているか」を採点してください。
    真剣に得意げな顔、余裕たっぷりな半笑い、目を逸らして誤魔化しているような顔ほど高得点。
    普通の表情や困り顔は低得点でよい。

    report_expression_bonus ツールで必ず結果を報告してください。
    - bonus: 0〜30の整数。表情の「煽り度」が強いほど高く
    - comment: 表情を一言(15字程度)でからかうコメント。無ければ空文字
  PROMPT

  EXPRESSION_TOOL = {
    name: "report_expression_bonus",
    description: "冷笑した瞬間の表情をボーナス点として採点する",
    input_schema: {
      type: "object",
      properties: {
        bonus: { type: "integer", description: "0〜30の表情ボーナス" },
        comment: { type: "string", description: "表情をからかう一言コメント" }
      },
      required: %w[bonus comment],
      additionalProperties: false
    },
    strict: true
  }.freeze

  JudgeResult = Struct.new(:sneer_detected, :cringe_score, :phrase, :reason, keyword_init: true)
  ExpressionResult = Struct.new(:bonus, :comment, keyword_init: true)

  # この3語が含まれる発話は判定基準に関わらず問答無用で120点(通常上限100を超える)
  FORCED_TRIGGER_WORDS = %w[うお ドワー きちー].freeze
  FORCED_TRIGGER_SCORE = 120

  class << self
    def judge(transcript)
      trigger = FORCED_TRIGGER_WORDS.find { |word| transcript.include?(word) }
      if trigger
        return JudgeResult.new(
          sneer_detected: true,
          cringe_score: FORCED_TRIGGER_SCORE,
          phrase: transcript,
          reason: "「#{trigger}」を検出したため問答無用で#{FORCED_TRIGGER_SCORE}点"
        )
      end

      message = client.messages.create(
        model: MODEL,
        max_tokens: 256,
        system_: [ { type: "text", text: JUDGE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
        tools: [ JUDGE_TOOL ],
        tool_choice: { type: "tool", name: "report_cringe_judgment" },
        messages: [ { role: "user", content: transcript } ]
      )

      block = message.content.find { |b| b.type == :tool_use }
      return JudgeResult.new(sneer_detected: false, cringe_score: 0, phrase: "", reason: "") unless block

      input = block.input
      score = input[:cringe_score].to_i.clamp(0, 100)

      # score=0のとき、phrase/reasonにモデルが無関係な文字列を返すことがあるため強制的に空にする
      JudgeResult.new(
        sneer_detected: score.positive? && input[:sneer_detected] == true,
        cringe_score: score,
        phrase: score.positive? ? input[:phrase].to_s : "",
        reason: score.positive? ? input[:reason].to_s : ""
      )
    end

    def harsh_feedback(nickname:, total_score:, top_utterances:)
      lines = top_utterances.map do |u|
        quote = u.cringe_phrase.presence || u.transcript
        "・#{quote}(#{u.cringe_score}点): #{u.cringe_reason}"
      end.join("\n")

      message = client.messages.create(
        model: MODEL,
        max_tokens: 120,
        system_: [ { type: "text", text: FEEDBACK_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
        messages: [
          { role: "user", content: "参加者: #{nickname}\n合計冷笑ポイント: #{total_score}\n痛かった発言:\n#{lines}" }
        ]
      )

      text_block = message.content.find { |b| b.type == :text }
      text_block&.text.to_s
    end

    def judge_expression(image_bytes:, content_type:, phrase:)
      message = client.messages.create(
        model: MODEL,
        max_tokens: 200,
        system_: [ { type: "text", text: EXPRESSION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
        tools: [ EXPRESSION_TOOL ],
        tool_choice: { type: "tool", name: "report_expression_bonus" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: content_type, data: Base64.strict_encode64(image_bytes) }
              },
              { type: "text", text: "この発言をした瞬間の顔です: 「#{phrase}」" }
            ]
          }
        ]
      )

      block = message.content.find { |b| b.type == :tool_use }
      return ExpressionResult.new(bonus: 0, comment: "") unless block

      input = block.input
      bonus = input[:bonus].to_i.clamp(0, 30)

      ExpressionResult.new(bonus: bonus, comment: bonus.positive? ? input[:comment].to_s : "")
    end

    def voice_roast_line(nickname:, top_phrase:)
      message = client.messages.create(
        model: MODEL,
        max_tokens: 100,
        system_: [ { type: "text", text: VOICE_ROAST_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
        messages: [
          { role: "user", content: "参加者: #{nickname}\n一番痛かった発言: #{top_phrase}" }
        ]
      )

      text_block = message.content.find { |b| b.type == :text }
      text_block&.text.to_s
    end

    private

    def client
      @client ||= Anthropic::Client.new
    end
  end
end
