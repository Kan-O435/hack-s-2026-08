require "net/http"

class WhisperTranscriber
  ENDPOINT = URI("https://api.openai.com/v1/audio/transcriptions")

  # 短い相槌・掛け声(え、うわ等)は音声情報が少なく他言語に誤認識されやすいため、
  # 期待する内容・話し方のヒントを与えて拾いやすくする
  TRANSCRIPTION_PROMPT =
    "これは友人同士の日本語の雑談・妄想話の音声です。タメ口・口語表現が多く、" \
    "「え、」「うわー」「はは」「ふふ」のような短い相槌・掛け声や、" \
    "「俺たち」「結局」「本当の自分」のような話し言葉特有の言い回しも、" \
    "聞こえたとおりに省略せず書き起こしてください。"

  def self.transcribe(audio_bytes, filename:, content_type:)
    boundary = SecureRandom.hex(16)
    body = build_body(boundary, audio_bytes, filename, content_type)

    request = Net::HTTP::Post.new(ENDPOINT)
    request["Authorization"] = "Bearer #{ENV.fetch('OPENAI_API_KEY')}"
    request["Content-Type"] = "multipart/form-data; boundary=#{boundary}"
    request.body = body

    response = Net::HTTP.start(ENDPOINT.host, ENDPOINT.port, use_ssl: true) do |http|
      http.request(request)
    end

    unless response.is_a?(Net::HTTPSuccess)
      raise "Whisper API error: #{response.code} #{response.body}"
    end

    JSON.parse(response.body)["text"].to_s.strip
  end

  def self.build_body(boundary, audio_bytes, filename, content_type)
    parts = []
    parts << text_part(boundary, "model", "gpt-transcribe")
    # gpt-transcribeは旧language(単数)ではなくlanguages(配列)を使う。
    # 両方同時に送るとAPIに拒否されるため、languagesのみ送る
    parts << text_part(boundary, "languages[]", "ja")
    parts << text_part(boundary, "prompt", TRANSCRIPTION_PROMPT)
    parts << file_part(boundary, "file", filename, content_type, audio_bytes)
    parts << "--#{boundary}--\r\n"
    # 日本語(UTF-8)のテキストパートと音声(BINARY)のパートを混在させてjoinすると
    # Encoding::CompatibilityErrorになるため、bytesとして結合する
    parts.map(&:b).join
  end
  private_class_method :build_body

  def self.text_part(boundary, name, value)
    "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{name}\"\r\n\r\n#{value}\r\n"
  end
  private_class_method :text_part

  def self.file_part(boundary, name, filename, content_type, bytes)
    "--#{boundary}\r\n" \
      "Content-Disposition: form-data; name=\"#{name}\"; filename=\"#{filename}\"\r\n" \
      "Content-Type: #{content_type}\r\n\r\n#{bytes}\r\n"
  end
  private_class_method :file_part
end
