module Api
  module V1
    class SessionsController < ApplicationController
      def create
        user = User.new(nickname: params.require(:nickname))

        if user.save
          render json: { user: { id: user.id, nickname: user.nickname }, token: user.device_token }, status: :created
        else
          render json: { error: { code: "invalid_nickname", message: user.errors.full_messages.join(", ") } },
                 status: :unprocessable_entity
        end
      end
    end
  end
end
