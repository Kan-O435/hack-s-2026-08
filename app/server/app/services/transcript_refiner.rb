class TranscriptRefiner
  MODEL = :"claude-haiku-4-5"

  # Whisper(gpt-transcribe)は早口・小声の発話で語尾の脱落や同音異義語の誤変換を起こしやすい。
  # 音声そのものは見えないため大胆な書き換えはできないが、文脈から明らかな誤りだけをLLMで拾い直す
  SYSTEM_PROMPT = <<~PROMPT.freeze
    あなたは音声書き起こし(Whisper)の補正担当です。
    渡されたテキストは、居酒屋での友人同士の日本語の雑談を音声認識した結果ですが、
    早口や小声の部分でうまく聞き取れず、不自然な文字列になっていることがあります。

    以下の方針で自然な話し言葉に補正してください:
    - 文脈上明らかに誤変換・聞き間違いだと分かる箇所だけを直す
      (例: 助詞の脱落、同音異義語の誤変換、文法的に破綻している箇所)
    - 意味を変えるような大胆な書き換え・要約・言い換えはしない
    - 自信がない箇所は無理に埋めず、聞こえた通りの表記を残す
    - 「え、」「うわー」「はは」のような相槌や、口語的な言い回しはそのまま活かす
    - 誤りが見当たらなければ、入力をそのまま返す

    補正後のテキストのみを出力してください。前置き・説明・カギ括弧は不要です。
  PROMPT

  class << self
    def refine(transcript)
      return transcript if transcript.blank?

      message = client.messages.create(
        model: MODEL,
        max_tokens: 256,
        system_: [ { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
        messages: [ { role: "user", content: transcript } ]
      )

      text_block = message.content.find { |b| b.type == :text }
      text_block&.text.to_s.strip.presence || transcript
    rescue StandardError => e
      # 補正に失敗してもWhisperの生の書き起こし結果自体は既に得られているので、
      # ここで例外を投げてジョブ全体をリトライさせず(＝Whisper呼び出しを無駄に再課金しない)、
      # 生のtranscriptにフォールバックする
      Rails.logger.error("TranscriptRefiner failed, falling back to raw transcript: #{e.message}")
      transcript
    end

    private

    def client
      @client ||= Anthropic::Client.new
    end
  end
end
