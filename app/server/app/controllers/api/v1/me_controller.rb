module Api
  module V1
    class MeController < ApplicationController
      before_action :authenticate_user!

      def rooms
        # room_results(最終スコア)とルームをfinishedにする導線がまだ無いため、常に空配列を返す(db_design.md参照)
        render json: { rooms: [] }
      end
    end
  end
end
