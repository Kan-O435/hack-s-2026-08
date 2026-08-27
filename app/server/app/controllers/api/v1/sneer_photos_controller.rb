module Api
  module V1
    class SneerPhotosController < ApplicationController
      before_action :authenticate_user!

      def update
        utterance = Utterance.find_by(id: params[:id])
        return render_error("not_found", "発話が見つかりません", :not_found) unless utterance
        return render_error("forbidden", "自分の発話にのみ写真を登録できます", :forbidden) unless utterance.user_id == current_user.id
        return render_error("not_sneer", "冷笑と判定された発話ではありません", :unprocessable_entity) unless utterance.sneer_detected?

        if utterance.sneer_photo.attached?
          return render json: photo_json(utterance), status: :ok
        end

        photo = params[:photo]
        captured_at = parse_captured_at(params[:captured_at])
        return render_error("invalid_photo", "写真が必要です", :unprocessable_entity) unless photo
        return render_error("invalid_captured_at", "撮影日時が不正です", :unprocessable_entity) unless captured_at

        utterance.snapshot_captured_at = captured_at
        utterance.sneer_photo.attach(photo)

        if utterance.save
          render json: photo_json(utterance), status: :created
        else
          render_error("invalid_photo", utterance.errors.full_messages.join(", "), :unprocessable_entity)
        end
      end

      def destroy
        utterance = Utterance.find_by(id: params[:id])
        return render_error("not_found", "発話が見つかりません", :not_found) unless utterance
        return render_error("forbidden", "自分の写真のみ削除できます", :forbidden) unless utterance.user_id == current_user.id

        utterance.sneer_photo.purge if utterance.sneer_photo.attached?
        utterance.update!(snapshot_captured_at: nil)
        head :no_content
      end

      private

      def parse_captured_at(value)
        Time.zone.iso8601(value.to_s)
      rescue ArgumentError
        nil
      end

      def photo_json(utterance)
        {
          utterance: {
            id: utterance.id,
            snapshot_captured_at: utterance.snapshot_captured_at,
            photo_url: expiring_photo_url(utterance.sneer_photo)
          }
        }
      end
    end
  end
end
