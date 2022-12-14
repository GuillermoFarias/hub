# image from node:16.13.0-alpine3.14
FROM node:16.13.0-alpine3.14

COPY docker/apache/000-default.conf /etc/apache2/sites-enabled/000-default.conf
COPY docker/php/xdebug.ini /usr/local/etc/php/conf.d/xdebug.ini


# Add user for laravel application
RUN groupadd -g 1000 www
RUN useradd -u 1000 -ms /bin/bash -g www www

# Copy existing application directory permissions
COPY --chown=www:www . /var/www/html

RUN chmod -R 777 /var/www/html/storage
