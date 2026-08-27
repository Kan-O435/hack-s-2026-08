class CringeJudge
  MODEL = :"claude-haiku-4-5"

  JUDGE_SYSTEM_PROMPT = <<~PROMPT.freeze
    あなたは「妄想ポエム痛さ判定機」の冷笑担当AIです。
    渡された発話1つに、痛い/冷笑されるべき要素が含まれるか判定してください。
    冷笑要素の例: 手垢のついた自分語り、スケールの大きすぎる主語(人生・世界・人間って等)、
    抽象的な精神論、同意を求めがちな決めpoem、根拠のない壮大な妄想、意識高い系ワード。

    report_cringe_judgment ツールで必ず結果を報告してください。
    - cringe_score: 0〜100の整数。冷笑要素が無ければ0にすること。文の長さやテンションではなく内容の痛さで判定する
    - phrase: 発話中で最も痛い一節をそのまま引用する。無ければ空文字
    - reason: 一言(20字程度)の理由。無ければ空文字
  PROMPT

  JUDGE_TOOL = {
    name: "report_cringe_judgment",
    description: "発話の冷笑ポイントを判定して報告する",
    input_schema: {
      type: "object",
      properties: {
        cringe_score: { type: "integer", description: "0〜100の冷笑ポイント" },
        phrase: { type: "string", description: "最も痛いフレーズの引用" },
        reason: { type: "string", description: "一言の理由" }
      },
      required: %w[cringe_score phrase reason],
      additionalProperties: false
    },
    strict: true
  }.freeze

  FEEDBACK_SYSTEM_PROMPT = <<~PROMPT.freeze
    あなたは「妄想ポエム痛さ判定機」の辛口講評担当AIです。
    参加者の合計冷笑ポイントと、特に痛かった発言を渡すので、
    2〜3文で辛口な講評を書いてください。人格否定はせず、発言の内容そのものを面白おかしく指摘すること。
    説教くさくならず、最後は少しだけ温度を戻して締めること。
  PROMPT

  JudgeResult = Struct.new(:cringe_score, :phrase, :reason, keyword_init: true)

  class << self
    def judge(transcript)
      message = client.messages.create(
        model: MODEL,
        max_tokens: 256,
        system_: [ { type: "text", text: JUDGE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
        tools: [ JUDGE_TOOL ],
        tool_choice: { type: "tool", name: "report_cringe_judgment" },
        messages: [ { role: "user", content: transcript } ]
      )

      block = message.content.find { |b| b.type == :tool_use }
      return JudgeResult.new(cringe_score: 0, phrase: "", reason: "") unless block

      input = block.input
      score = input[:cringe_score].to_i.clamp(0, 100)

      # score=0のとき、phrase/reasonにモデルが無関係な文字列を返すことがあるため強制的に空にする
      JudgeResult.new(
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
        max_tokens: 300,
        system_: [ { type: "text", text: FEEDBACK_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
        messages: [
          { role: "user", content: "参加者: #{nickname}\n合計冷笑ポイント: #{total_score}\n痛かった発言:\n#{lines}" }
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
